/**
 * Deleting what's inside a region (marching ants) selection — the helpers
 * behind `Editor.deleteInPixelSelection`.
 *
 * - Image layers: the pixels under the selection's exact shape (the mask,
 *   not its bounding box) become transparent. The selection is mapped into
 *   each image's own pixel grid through the layer's full transform (position,
 *   scale, rotation, flips, groups), so it works however the image is placed.
 * - Vector layers (shapes, paths, text) and individual brush strokes: there
 *   is no boolean path operation in the editor to cut a shape out of a path,
 *   so one is deleted only when the selection covers all of it; one only
 *   partly covered is left unchanged (the caller reports it).
 *
 * The classification helper is pure and unit-tested; the rest needs a DOM.
 */
import { util, type Canvas, type FabricImage, type FabricObject, type TMat2D } from 'fabric';
import type { PixelSelection } from './pixelSelection';

/**
 * Runs `fn` with Fabric's off-screen culling disabled, so objects scrolled
 * out of view are still drawn by `obj.render()` (Fabric skips top-level
 * objects outside the viewport while `skipOffscreen` is on).
 */
export function withOffscreenRendering<T>(canvas: Canvas | undefined, fn: () => T): T {
  if (!canvas) return fn();
  const prev = canvas.skipOffscreen;
  canvas.skipOffscreen = false;
  try {
    return fn();
  } finally {
    canvas.skipOffscreen = prev;
  }
}

/** The selection mask as a canvas: opaque where selected, transparent elsewhere (mask resolution). */
export function selectionMaskCanvas(sel: PixelSelection): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = sel.width;
  el.height = sel.height;
  const ctx = el.getContext('2d')!;
  const img = ctx.createImageData(sel.width, sel.height);
  const m = sel.getMask();
  for (let i = 0; i < m.length; i++) if (m[i]) img.data[i * 4 + 3] = 255;
  ctx.putImageData(img, 0, 0);
  return el;
}

/**
 * Erases the selected area from an image layer's pixels. Returns a canvas
 * with the new pixels (same size as the image's source), or null when the
 * selection doesn't touch any visible pixel of the image.
 */
export function eraseImagePixels(img: FabricImage, mask: HTMLCanvasElement, scale: number): HTMLCanvasElement | null {
  const el = img.getElement() as HTMLImageElement | HTMLCanvasElement;
  const imgW = el instanceof HTMLImageElement ? el.naturalWidth || el.width : el.width;
  const imgH = el instanceof HTMLImageElement ? el.naturalHeight || el.height : el.height;
  if (!imgW || !imgH || !img.width || !img.height) return null;

  // Mask pixel → scene → image pixel (image-local coordinates are centred).
  const toPixels: TMat2D = util.multiplyTransformMatrices(
    [1, 0, 0, 1, img.width / 2 + (img.cropX ?? 0), img.height / 2 + (img.cropY ?? 0)],
    util.invertTransform(img.calcTransformMatrix()),
  );
  const m = util.multiplyTransformMatrices(toPixels, [1 / scale, 0, 0, 1 / scale, 0, 0]);

  // Where the mask lands in the image (quick reject + the region to compare).
  const corners = [
    [0, 0],
    [mask.width, 0],
    [0, mask.height],
    [mask.width, mask.height],
  ].map(([x, y]) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))));
  const x1 = Math.min(imgW, Math.ceil(Math.max(...corners.map((p) => p.x))));
  const y1 = Math.min(imgH, Math.ceil(Math.max(...corners.map((p) => p.y))));
  if (x1 <= x0 || y1 <= y0) return null;

  const out = document.createElement('canvas');
  out.width = imgW;
  out.height = imgH;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(el, 0, 0);
  const before = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  // Punch the selection's exact shape out of the pixels. Nearest-neighbour
  // sampling keeps the edge identical to the marching ants.
  ctx.save();
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
  const after = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  for (let i = 3; i < before.length; i += 4) if (before[i] !== after[i]) return out;
  return null; // only already-transparent pixels were under the selection
}

export type Coverage = 'none' | 'full' | 'partial';

/**
 * How much of a layer a selection covers, from the layer's own rendering
 * (RGBA at mask resolution) and the selection mask.
 *
 * A layer counts as fully covered when every solid pixel of it (alpha ≥ 250)
 * is selected — soft anti-aliased edge pixels are ignored, since colour-based
 * selections (Quick Selection) naturally stop just short of them. Layers
 * with no solid pixels (hairlines) use every pixel that is at least half
 * covered. `extendsOutside` marks layers reaching beyond the artboard, whose
 * outer part the selection can never include.
 */
export function classifyCoverage(rgba: Uint8ClampedArray, mask: Uint8Array, extendsOutside: boolean): Coverage {
  let solid = 0;
  let solidSelected = 0;
  let half = 0;
  let halfSelected = 0;
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) {
    const a = rgba[p];
    if (a >= 128) {
      half++;
      if (mask[i]) halfSelected++;
      if (a >= 250) {
        solid++;
        if (mask[i]) solidSelected++;
      }
    }
  }
  const [total, selected] = solid ? [solid, solidSelected] : [half, halfSelected];
  if (!selected) return 'none';
  if (selected === total && !extendsOutside) return 'full';
  return 'partial';
}

/**
 * Renders one layer on its own at mask resolution, where it sits in the
 * scene. (Rendered outside its group's own render pass, Fabric applies the
 * group transforms itself.)
 */
export function renderLayerAlone(obj: FabricObject, width: number, height: number, scale: number): Uint8ClampedArray {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(scale, scale);
  withOffscreenRendering(obj.canvas as Canvas | undefined, () => obj.render(ctx));
  return ctx.getImageData(0, 0, width, height).data;
}
