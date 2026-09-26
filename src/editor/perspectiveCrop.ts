/**
 * Applies a perspective crop to the document's layers.
 *
 * Fabric.js can only transform objects with affine transforms (move, scale,
 * rotate, skew), which keep parallel lines parallel. A perspective correction
 * does not, so it can't be applied to vector objects. Like Photoshop's
 * Perspective Crop (which works on pixels), each affected layer is rendered,
 * warped pixel by pixel into the corrected rectangle, and replaced by an image
 * layer. The layer structure is kept: names, ids, groups, visibility, lock,
 * opacity and blend modes carry over, and every new image records what it was
 * made from (`samaPerspective`) for the structured export.
 */
import { FabricImage, Group, IText, Point, StaticCanvas, util } from 'fabric';
import type { Canvas, FabricObject } from 'fabric';
import type { AssetRegistry } from './assets';
import { inferKind } from './meta';
import { PaintLayer } from './objects/PaintLayer';
import { serializeObject } from './serialization';
import {
  applyHomography,
  clipPolygon,
  computeHomography,
  polygonArea,
  warpInto,
  type Homography,
  type XY,
} from './perspective';

/** Largest side, in pixels, of an intermediate render of one layer. */
const MAX_SOURCE_SIDE = 8192;
/** Upper bound on source oversampling (sharper results when enlarging). */
const MAX_SOURCE_SCALE = 4;

interface WarpContext {
  canvas: Canvas;
  assets: AssetRegistry;
  quad: XY[];
  width: number;
  height: number;
  /** Corrected image → scene. */
  toScene: Homography;
  /** Scene → corrected image. */
  fromScene: Homography;
}

/**
 * Warps `objects` (the canvas's top-level layers) so that `quad` — corners in
 * order top-left, top-right, bottom-right, bottom-left, in artboard
 * coordinates — becomes the rectangle (0,0)–(width,height). Returns the new
 * top-level layers; layers with nothing inside the quad are dropped.
 */
export async function perspectiveWarpLayers(opts: {
  canvas: Canvas;
  assets: AssetRegistry;
  objects: FabricObject[];
  quad: XY[];
  width: number;
  height: number;
}): Promise<FabricObject[]> {
  const { quad, width, height } = opts;
  const rect = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const ctx: WarpContext = {
    ...opts,
    toScene: computeHomography(rect, quad),
    fromScene: computeHomography(quad, rect),
  };
  const out: FabricObject[] = [];
  for (const obj of opts.objects) {
    const warped = await warpLayer(ctx, obj, true);
    if (warped) out.push(warped);
  }
  return out;
}

async function warpLayer(ctx: WarpContext, obj: FabricObject, topLevel: boolean): Promise<FabricObject | null> {
  // Groups keep their structure: warp each child, then regroup.
  if (obj instanceof Group && !(obj instanceof PaintLayer)) {
    const children: FabricObject[] = [];
    for (const child of obj.getObjects()) {
      const w = await warpLayer(ctx, child, false);
      if (w) children.push(w);
    }
    if (!children.length) return null;
    const group = new Group(children);
    copyLayerProps(obj, group);
    group.samaKind = 'group';
    return group;
  }
  return warpLeaf(ctx, obj, topLevel);
}

function copyLayerProps(from: FabricObject, to: FabricObject) {
  to.samaId = from.samaId;
  to.samaName = from.samaName;
  to.samaLocked = from.samaLocked;
  to.set({
    visible: from.visible,
    opacity: from.opacity,
    globalCompositeOperation: from.globalCompositeOperation,
  });
}

/** Serialized copy of a layer placed in scene coordinates. */
function sceneJson(ctx: WarpContext, obj: FabricObject, topLevel: boolean): Record<string, unknown> {
  if (topLevel) return serializeObject(ctx.canvas, obj);
  const d = util.qrDecompose(obj.calcTransformMatrix());
  return {
    ...obj.toObject(),
    left: d.translateX,
    top: d.translateY,
    scaleX: d.scaleX,
    scaleY: d.scaleY,
    angle: d.angle,
    skewX: d.skewX,
    skewY: 0,
    originX: 'center',
    originY: 'center',
  };
}

async function warpLeaf(ctx: WarpContext, obj: FabricObject, topLevel: boolean): Promise<FabricObject | null> {
  obj.setCoords();
  const b = obj.getBoundingRect();
  const box = [
    { x: b.left, y: b.top },
    { x: b.left + b.width, y: b.top },
    { x: b.left + b.width, y: b.top + b.height },
    { x: b.left, y: b.top + b.height },
  ];
  // Only the part of the layer inside the quad ends up in the result.
  const visible = clipPolygon(box, ctx.quad);
  if (visible.length < 3 || Math.abs(polygonArea(visible)) < 0.25) return null;

  // Where that part lands in the corrected image.
  const mapped = visible.map((p) => applyHomography(ctx.fromScene, p)).filter((p): p is XY => !!p);
  if (mapped.length < 3) return null;
  const ox = Math.max(0, Math.floor(Math.min(...mapped.map((p) => p.x))) - 1);
  const oy = Math.max(0, Math.floor(Math.min(...mapped.map((p) => p.y))) - 1);
  const ox2 = Math.min(ctx.width, Math.ceil(Math.max(...mapped.map((p) => p.x))) + 1);
  const oy2 = Math.min(ctx.height, Math.ceil(Math.max(...mapped.map((p) => p.y))) + 1);
  const outW = ox2 - ox;
  const outH = oy2 - oy;
  if (outW <= 0 || outH <= 0) return null;

  // Render the source region of the scene that feeds those pixels.
  const rx = Math.floor(Math.min(...visible.map((p) => p.x))) - 2;
  const ry = Math.floor(Math.min(...visible.map((p) => p.y))) - 2;
  const rw = Math.ceil(Math.max(...visible.map((p) => p.x))) + 2 - rx;
  const rh = Math.ceil(Math.max(...visible.map((p) => p.y))) + 2 - ry;
  let scale = Math.min(MAX_SOURCE_SCALE, Math.max(1, outW / rw, outH / rh));
  scale = Math.min(scale, MAX_SOURCE_SIDE / rw, MAX_SOURCE_SIDE / rh);
  const source = await renderLayer(sceneJson(ctx, obj, topLevel), rx, ry, rw, rh, scale);

  const pixels = new Uint8ClampedArray(outW * outH * 4);
  const any = warpInto(
    { data: source.data, width: source.width, height: source.height, originX: rx, originY: ry, scale },
    ctx.toScene,
    pixels,
    ox,
    oy,
    outW,
    outH,
  );
  if (!any) return null;

  // Store the result as an image asset and build the new layer.
  const el = document.createElement('canvas');
  el.width = outW;
  el.height = outH;
  el.getContext('2d')!.putImageData(new ImageData(pixels, outW, outH), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    el.toBlob((bl) => (bl ? resolve(bl) : reject(new Error('Could not encode the corrected layer'))), 'image/png'),
  );
  const name = obj.samaName ?? inferKind(obj);
  const asset = await ctx.assets.add(blob, `${name}.png`);
  const img = await FabricImage.fromURL(asset.url);
  img.setPositionByOrigin(new Point(ox + outW / 2, oy + outH / 2), 'center', 'center');
  copyLayerProps(obj, img);
  img.samaKind = 'image';
  img.samaAssetId = asset.id;
  img.samaFileName = `${name}.png`;
  // Remember what the layer was, so the structured export keeps its meaning.
  img.samaPerspective = obj.samaPerspective ?? {
    originalType: inferKind(obj),
    ...(obj instanceof IText ? { text: obj.text } : {}),
  };
  return img;
}

/** Renders one layer, alone, into an RGBA buffer covering the given scene region. */
async function renderLayer(json: Record<string, unknown>, rx: number, ry: number, rw: number, rh: number, scale: number) {
  const width = Math.max(1, Math.ceil(rw * scale));
  const height = Math.max(1, Math.ceil(rh * scale));
  const el = document.createElement('canvas');
  const sc = new StaticCanvas(el, { width, height, enableRetinaScaling: false, renderOnAddRemove: false });
  try {
    sc.setViewportTransform([scale, 0, 0, scale, -rx * scale, -ry * scale]);
    const [clone] = await util.enlivenObjects<FabricObject>([json]);
    // Opacity, blend mode and visibility are re-applied on the new layer.
    clone.set({ opacity: 1, globalCompositeOperation: 'source-over', visible: true });
    sc.add(clone);
    sc.renderAll();
    const data = sc.getContext().getImageData(0, 0, width, height).data;
    return { data, width, height };
  } finally {
    void sc.dispose();
  }
}
