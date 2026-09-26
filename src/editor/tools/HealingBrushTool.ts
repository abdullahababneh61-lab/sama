/**
 * Healing Brush (Shift+J), like Photoshop's Healing Brush.
 *
 * Unlike the Spot Healing Brush, which rebuilds an area from its own
 * surroundings, this tool copies texture from a source point you choose — and
 * then blends it into the destination's colour and lighting (healing.ts), so
 * the repair doesn't show up as a pasted block.
 *
 * - Alt/Option+click an image to set the source point (a crosshair marks it).
 * - Paint elsewhere: each stroke samples from the source point, offset by how
 *   far the pointer has moved from where the stroke started. A live preview
 *   shows the copied texture; on release it is healed into place.
 * - Painting before a source is set shows a reminder instead.
 * - Esc clears the source point and cancels a stroke in progress.
 * - Brush size is shared with the Spot Healing Brush (options bar, `[` / `]`).
 *
 * Works on image layers only (imported photos, perspective-cropped layers):
 * vector shapes, text and brush strokes have no pixels to heal.
 */
import { FabricImage, Point, util } from 'fabric';
import type { FabricObject, TMat2D } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { healPatch } from '../healing';
import { findById, isEffectivelyLocked, isEffectivelyVisible, walkLayers } from '../meta';

interface Source {
  /** Artboard coordinates of the source point. */
  x: number;
  y: number;
  /** Image layer the texture is copied from. */
  layerId: string;
}

interface Stroke {
  target: FabricImage;
  sourceImage: FabricImage;
  points: Point[];
  /** Source minus stroke start: added to every destination point. */
  offset: Point;
}

type Drawable = HTMLImageElement | HTMLCanvasElement;

export class HealingBrushTool extends Tool {
  readonly id = 'healingBrush' as const;
  cursor = 'crosshair';

  private source: Source | null = null;
  private stroke: Stroke | null = null;
  private busy = false;
  private preview: HTMLCanvasElement | null = null;

  activate() {
    this.editor.canvas.requestRenderAll();
  }

  deactivate() {
    this.stroke = null;
    this.editor.hideBrushCursor();
    this.editor.canvas.requestRenderAll();
  }

  private get size() {
    return this.editor.toolOptions.spotHealingBrush.size;
  }

  /** The current source point (for tests and future UI). */
  get sourcePoint() {
    return this.source ? { ...this.source } : null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    if (this.busy) return;
    const p = ev.scenePoint;
    if (ev.alt) {
      const img = this.imageAt(p, false);
      if (!img?.samaId) {
        this.editor.notify('toast.healingSourceNoImage');
        return;
      }
      this.source = { x: p.x, y: p.y, layerId: img.samaId };
      this.editor.canvas.requestRenderAll();
      return;
    }
    if (!this.source) {
      this.editor.notify('toast.healingNeedsSource');
      return;
    }
    const sourceImage = findById(this.editor.canvas, this.source.layerId);
    if (!(sourceImage instanceof FabricImage)) {
      // The source layer was deleted or replaced.
      this.source = null;
      this.editor.notify('toast.healingNeedsSource');
      return;
    }
    const target = this.targetAt(p);
    if (!target) {
      this.editor.notify('toast.healingNoImage');
      return;
    }
    this.stroke = {
      target,
      sourceImage,
      points: [p],
      offset: new Point(this.source.x - p.x, this.source.y - p.y),
    };
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.editor.showBrushCursor(ev.viewportPoint, this.size);
    const s = this.stroke;
    if (!s) return;
    const last = s.points[s.points.length - 1];
    if (last.distanceFrom(ev.scenePoint) * this.editor.canvas.getZoom() < 1) return;
    s.points.push(ev.scenePoint);
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp() {
    const s = this.stroke;
    if (!s) return;
    this.busy = true;
    void this.heal(s, this.size)
      .catch((err) => {
        console.error('[sama] healing failed', err);
        this.editor.notify('toast.spotHealFailed', 'warning');
      })
      .finally(() => {
        this.busy = false;
        this.stroke = null;
        this.editor.canvas.requestRenderAll();
      });
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && !this.busy && (this.source || this.stroke)) {
      this.source = null;
      this.stroke = null;
      this.editor.canvas.requestRenderAll();
      return true;
    }
    return false;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    const s = this.stroke;
    // Live preview: the source texture, shifted by the stroke offset, shown
    // only where the brush has painted.
    if (s) this.drawPreview(ctx, s);
    // Source crosshair: fixed before painting, follows the sampling point during a stroke.
    if (this.source) {
      const at = s ? s.points[s.points.length - 1].add(s.offset) : new Point(this.source.x, this.source.y);
      drawCrosshair(ctx, this.editor.sceneToViewport(at));
    }
  }

  // ---------------------------------------------------------------------------

  private drawPreview(ctx: CanvasRenderingContext2D, s: Stroke) {
    const c = this.editor.canvas;
    const w = c.width;
    const h = c.height;
    if (!this.preview) this.preview = document.createElement('canvas');
    const off = this.preview;
    if (off.width !== w || off.height !== h) {
      off.width = w;
      off.height = h;
    }
    const octx = off.getContext('2d')!;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, w, h);
    // Draw the source image as if moved by -offset (so the source lands under the brush).
    const img = s.sourceImage;
    const el = img.getElement() as Drawable;
    const v = c.viewportTransform;
    octx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]);
    octx.translate(-s.offset.x, -s.offset.y);
    const m = img.calcTransformMatrix();
    octx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    octx.drawImage(el, -img.width / 2 - (img.cropX ?? 0), -img.height / 2 - (img.cropY ?? 0));
    // Keep it only inside the painted stroke.
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = 'destination-in';
    const pts = s.points.map((p) => this.editor.sceneToViewport(p));
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.lineWidth = this.size * c.getZoom();
    octx.beginPath();
    octx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x, pts[i].y);
    if (pts.length === 1) octx.lineTo(pts[0].x + 0.01, pts[0].y);
    octx.stroke();
    octx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
  }

  /** Top-most visible image under `p` (optionally only unlocked ones). */
  private imageAt(p: Point, unlockedOnly: boolean): FabricImage | null {
    let found: FabricImage | null = null;
    walkLayers(this.editor.canvas.getObjects(), (o: FabricObject) => {
      if (!(o instanceof FabricImage) || !isEffectivelyVisible(o)) return;
      if (unlockedOnly && isEffectivelyLocked(o)) return;
      o.setCoords();
      if (o.containsPoint(p)) found = o;
    });
    return found;
  }

  /** The layer to paint on: the selected image, or the top-most unlocked image under `p`. */
  private targetAt(p: Point): FabricImage | null {
    const active = this.editor.canvas.getActiveObject();
    if (active instanceof FabricImage && isEffectivelyVisible(active) && !isEffectivelyLocked(active)) return active;
    return this.imageAt(p, true);
  }

  private async heal(s: Stroke, size: number) {
    const { target, sourceImage, points, offset } = s;
    const tEl = target.getElement() as Drawable;
    const [tw, th] = naturalSize(tEl);
    const toT = toPixels(target);
    const pts = points.map((p) => p.transform(toT));
    const radius = (size / 2) * Math.max(Math.hypot(toT[0], toT[1]), Math.hypot(toT[2], toT[3]));
    const margin = Math.ceil(radius + 4);
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) - margin));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - margin));
    const x1 = Math.min(tw, Math.ceil(Math.max(...pts.map((p) => p.x)) + margin));
    const y1 = Math.min(th, Math.ceil(Math.max(...pts.map((p) => p.y)) + margin));
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return;

    // Brush coverage (0..1) on the target's pixel grid.
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = rw;
    maskCanvas.height = rh;
    const mctx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
    const mm = util.multiplyTransformMatrices([1, 0, 0, 1, -x0, -y0], toT);
    mctx.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]);
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.lineWidth = size;
    mctx.beginPath();
    mctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) mctx.lineTo(points[i].x, points[i].y);
    if (points.length === 1) mctx.lineTo(points[0].x + 0.01, points[0].y);
    mctx.stroke();
    const md = mctx.getImageData(0, 0, rw, rh).data;
    const weight = new Float32Array(rw * rh);
    for (let i = 0; i < weight.length; i++) weight[i] = md[i * 4 + 3] / 255;

    // Destination pixels.
    const full = drawToCanvas(tEl, tw, th);
    const fctx = full.getContext('2d', { willReadFrequently: true })!;
    const dest = fctx.getImageData(x0, y0, rw, rh);

    // Source pixels resampled onto the destination grid:
    // target pixel → artboard → + offset → source image pixel.
    const sEl = sourceImage.getElement() as Drawable;
    const [sw, sh] = naturalSize(sEl);
    const toS = toPixels(sourceImage);
    const map = util.multiplyTransformMatrices(
      util.multiplyTransformMatrices(toS, [1, 0, 0, 1, offset.x, offset.y]),
      util.invertTransform(toT),
    );
    const corners = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(([x, y]) => new Point(x, y).transform(map));
    const sx0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2);
    const sy0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2);
    const sx1 = Math.min(sw, Math.ceil(Math.max(...corners.map((p) => p.x))) + 2);
    const sy1 = Math.min(sh, Math.ceil(Math.max(...corners.map((p) => p.y))) + 2);
    const source = new Uint8ClampedArray(rw * rh * 4);
    const valid = new Uint8Array(rw * rh);
    if (sx1 > sx0 && sy1 > sy0) {
      const sCanvas = sourceImage === target ? full : drawToCanvas(sEl, sw, sh);
      const region = sCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(sx0, sy0, sx1 - sx0, sy1 - sy0);
      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < rw; i++) {
          const sp = new Point(x0 + i + 0.5, y0 + j + 0.5).transform(map);
          if (sp.x < 0 || sp.y < 0 || sp.x > sw || sp.y > sh) continue;
          if (sampleBilinear(region, sp.x - 0.5 - sx0, sp.y - 0.5 - sy0, source, (j * rw + i) * 4)) valid[j * rw + i] = 1;
        }
      }
    }

    if (!healPatch(dest.data, source, weight, valid, rw, rh)) {
      this.editor.notify('toast.healingSourceOutside');
      return;
    }
    fctx.putImageData(dest, x0, y0);

    const blob = await new Promise<Blob>((resolve, reject) =>
      full.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the healed image'))), 'image/png'),
    );
    const asset = await this.editor.assets.add(blob, target.samaFileName ?? `${target.samaName ?? 'image'}.png`);
    await target.setSrc(asset.url);
    target.samaAssetId = asset.id;
    target.set('dirty', true);
    target.parent?.set('dirty', true);
    this.editor.canvas.requestRenderAll();
    this.editor.commit('Healing brush');
  }
}

/** Artboard → image-pixel transform (image-local coordinates are centred). */
function toPixels(img: FabricImage): TMat2D {
  return util.multiplyTransformMatrices(
    [1, 0, 0, 1, img.width / 2 + (img.cropX ?? 0), img.height / 2 + (img.cropY ?? 0)],
    util.invertTransform(img.calcTransformMatrix()),
  );
}

function naturalSize(el: Drawable): [number, number] {
  return el instanceof HTMLImageElement ? [el.naturalWidth || el.width, el.naturalHeight || el.height] : [el.width, el.height];
}

function drawToCanvas(el: Drawable, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d', { willReadFrequently: true })!.drawImage(el, 0, 0);
  return c;
}

/** Bilinear sample (premultiplied interpolation) into `out` at offset `o`. */
function sampleBilinear(img: ImageData, x: number, y: number, out: Uint8ClampedArray, o: number): boolean {
  const { data, width, height } = img;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let wsum = 0;
  for (let k = 0; k < 4; k++) {
    const xx = Math.min(width - 1, Math.max(0, x0 + (k & 1)));
    const yy = Math.min(height - 1, Math.max(0, y0 + (k >> 1)));
    const wt = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
    const p = (yy * width + xx) * 4;
    const pa = (data[p + 3] / 255) * wt;
    r += data[p] * pa;
    g += data[p + 1] * pa;
    b += data[p + 2] * pa;
    a += pa;
    wsum += wt;
  }
  if (wsum <= 0) return false;
  out[o] = a > 0 ? r / a : 0;
  out[o + 1] = a > 0 ? g / a : 0;
  out[o + 2] = a > 0 ? b / a : 0;
  out[o + 3] = (a / wsum) * 255;
  return true;
}

function drawCrosshair(ctx: CanvasRenderingContext2D, p: { x: number; y: number }) {
  ctx.save();
  for (const [color, width] of [
    ['rgba(0, 0, 0, 0.7)', 3],
    ['#ffffff', 1.5],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.moveTo(p.x - 11, p.y);
    ctx.lineTo(p.x - 3, p.y);
    ctx.moveTo(p.x + 3, p.y);
    ctx.lineTo(p.x + 11, p.y);
    ctx.moveTo(p.x, p.y - 11);
    ctx.lineTo(p.x, p.y - 3);
    ctx.moveTo(p.x, p.y + 3);
    ctx.lineTo(p.x, p.y + 11);
    ctx.stroke();
  }
  ctx.restore();
}
