/**
 * Spot Healing Brush (J): paint over a blemish in a photo to remove it.
 *
 * - Works on raster image layers (imported photos, and layers produced by the
 *   Perspective Crop). Shapes, text, pen paths and brush strokes are vectors
 *   with no pixels to repair; painting over them shows a notice instead.
 * - The layer painted on is the selected image layer, or else the top-most
 *   visible, unlocked image under the start of the stroke.
 * - Brush size in the options bar, `[` / `]` to resize; a round cursor shows
 *   the size.
 * - On release, the painted area is rebuilt from the surrounding pixels with
 *   a feathered edge (see inpaint.ts) and the layer's image is replaced. The
 *   change is one undoable step.
 * - Esc cancels the stroke in progress.
 */
import { FabricImage, Point, util } from 'fabric';
import type { FabricObject, TMat2D } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { inpaint } from '../inpaint';
import { isEffectivelyLocked, isEffectivelyVisible, walkLayers } from '../meta';

const PREVIEW_FILL = 'rgba(30, 30, 38, 0.45)';
const PREVIEW_EDGE = 'rgba(255, 255, 255, 0.8)';

export class SpotHealingBrushTool extends Tool {
  readonly id = 'spotHealingBrush' as const;
  cursor = 'crosshair';

  private points: Point[] = [];
  private target: FabricImage | null = null;
  private busy = false;

  deactivate() {
    this.cancel();
    this.editor.hideBrushCursor();
  }

  private get size() {
    return this.editor.toolOptions.spotHealingBrush.size;
  }

  private cancel() {
    this.points = [];
    this.target = null;
    this.editor.canvas.requestRenderAll();
  }

  onPointerDown(ev: ToolPointerEvent) {
    if (this.busy) return;
    const target = this.findTarget(ev.scenePoint);
    if (!target) {
      this.editor.notify('toast.spotHealNoImage');
      return;
    }
    this.target = target;
    this.points = [ev.scenePoint];
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.editor.showBrushCursor(ev.viewportPoint, this.size);
    if (!this.target || !this.points.length) return;
    const last = this.points[this.points.length - 1];
    // Skip points closer than a pixel on screen.
    if (last.distanceFrom(ev.scenePoint) * this.editor.canvas.getZoom() < 1) return;
    this.points.push(ev.scenePoint);
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp() {
    const target = this.target;
    const points = this.points;
    if (!target || !points.length) return;
    this.busy = true;
    void this.heal(target, points, this.size)
      .catch((err) => {
        console.error('[sama] spot healing failed', err);
        this.editor.notify('toast.spotHealFailed', 'warning');
      })
      .finally(() => {
        this.busy = false;
        this.cancel();
      });
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.points.length && !this.busy) {
      this.cancel();
      return true;
    }
    return false;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.points.length) return;
    const v = this.points.map((p) => this.editor.sceneToViewport(p));
    const width = this.size * this.editor.canvas.getZoom();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
    if (v.length === 1) ctx.lineTo(v[0].x + 0.01, v[0].y);
    // Light rim then dark translucent body, so the painted area reads on any photo.
    ctx.strokeStyle = PREVIEW_EDGE;
    ctx.lineWidth = width + 2;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = PREVIEW_FILL;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------

  /** The image layer to heal: the selected one, or the top-most one under `p`. */
  private findTarget(p: Point): FabricImage | null {
    const usable = (o: FabricObject): o is FabricImage =>
      o instanceof FabricImage && isEffectivelyVisible(o) && !isEffectivelyLocked(o);
    const active = this.editor.canvas.getActiveObject();
    if (active && usable(active)) return active;
    let found: FabricImage | null = null;
    // walkLayers visits bottom to top, so the last hit is the top-most.
    walkLayers(this.editor.canvas.getObjects(), (o) => {
      if (!usable(o)) return;
      o.setCoords();
      if (o.containsPoint(p)) found = o;
    });
    return found;
  }

  /** Repairs the stroke's area in `img` and swaps in the new pixels. */
  private async heal(img: FabricImage, stroke: Point[], size: number) {
    const el = img.getElement() as HTMLImageElement | HTMLCanvasElement;
    const w = img.width;
    const h = img.height;
    if (!w || !h) return;

    // Scene → image-pixel transform (image-local coordinates are centred).
    const toPixels: TMat2D = util.multiplyTransformMatrices(
      [1, 0, 0, 1, w / 2 + (img.cropX ?? 0), h / 2 + (img.cropY ?? 0)],
      util.invertTransform(img.calcTransformMatrix()),
    );
    const pts = stroke.map((p) => p.transform(toPixels));
    // Brush radius in pixels along the image's most-stretched axis.
    const sx = Math.hypot(toPixels[0], toPixels[1]);
    const sy = Math.hypot(toPixels[2], toPixels[3]);
    const radius = (size / 2) * Math.max(sx, sy);
    const feather = Math.max(2, Math.round(radius * 0.35));
    const margin = Math.ceil(radius + feather + 8);

    const imgW = el instanceof HTMLImageElement ? el.naturalWidth || el.width : el.width;
    const imgH = el instanceof HTMLImageElement ? el.naturalHeight || el.height : el.height;
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) - margin));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - margin));
    const x1 = Math.min(imgW, Math.ceil(Math.max(...pts.map((p) => p.x)) + margin));
    const y1 = Math.min(imgH, Math.ceil(Math.max(...pts.map((p) => p.y)) + margin));
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return; // the stroke missed the image entirely

    // Rasterize the stroke into a mask, in the image's pixel grid.
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = rw;
    maskCanvas.height = rh;
    const mctx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
    const m = util.multiplyTransformMatrices([1, 0, 0, 1, -x0, -y0], toPixels);
    mctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.lineWidth = size;
    mctx.strokeStyle = '#000';
    mctx.beginPath();
    mctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) mctx.lineTo(stroke[i].x, stroke[i].y);
    if (stroke.length === 1) mctx.lineTo(stroke[0].x + 0.01, stroke[0].y);
    mctx.stroke();
    const maskData = mctx.getImageData(0, 0, rw, rh).data;
    const mask = new Uint8Array(rw * rh);
    let painted = 0;
    for (let i = 0; i < mask.length; i++) {
      if (maskData[i * 4 + 3] > 127) {
        mask[i] = 1;
        painted++;
      }
    }
    if (!painted) return;

    // Repair the region.
    const full = document.createElement('canvas');
    full.width = imgW;
    full.height = imgH;
    const fctx = full.getContext('2d', { willReadFrequently: true })!;
    fctx.drawImage(el, 0, 0);
    const region = fctx.getImageData(x0, y0, rw, rh);
    const ok = inpaint(region.data, rw, rh, mask, { feather, seed: (x0 * 73856093) ^ (y0 * 19349663) });
    if (!ok) {
      this.editor.notify('toast.spotHealTooLarge', 'warning');
      return;
    }
    fctx.putImageData(region, x0, y0);

    // Store the new pixels as an asset and point the layer at them.
    const blob = await new Promise<Blob>((resolve, reject) =>
      full.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the healed image'))), 'image/png'),
    );
    const asset = await this.editor.assets.add(blob, img.samaFileName ?? `${img.samaName ?? 'image'}.png`);
    await img.setSrc(asset.url);
    img.samaAssetId = asset.id;
    img.set('dirty', true);
    img.parent?.set('dirty', true);
    this.editor.canvas.requestRenderAll();
    this.editor.commit('Spot healing');
  }
}
