/**
 * Quick Selection tool (Shift+W): paint to select similar areas.
 *
 * - Painting adds the area under the round brush to the selection, and also
 *   grows it into the similar colours around the brush: from each spot the
 *   brush passes over, a contiguous flood fill takes in neighbouring pixels
 *   whose colour is close to the colour under the brush centre (tolerance
 *   32 per channel), stopping at colour edges.
 * - Alt/Option+paint removes from the selection the same way.
 * - Size in the options bar, or [ and ]. A round cursor shows the size.
 * - Esc cancels a stroke in progress, otherwise clears the selection.
 *
 * Works on the pixels of the visible picture (the artboard is rendered once
 * per stroke), so it applies to any artwork — shapes, text, paint, photos.
 */
import type { Point } from 'fabric';
import { RegionTool } from './RegionTool';
import type { ToolPointerEvent } from './Tool';
import { floodFill, stampCircle } from '../pixelSelection';
import type { ScenePixels } from '../scenePixels';

/** Colour similarity for the flood fill (0–255 per channel). */
export const QUICK_SELECTION_TOLERANCE = 32;

export class QuickSelectionTool extends RegionTool {
  readonly id = 'quickSelection' as const;
  cursor = 'crosshair';

  private pixels: ScenePixels | null = null;
  /** Selection before the stroke started (restored by Esc). */
  private base: Uint8Array | null = null;
  /** Pixels under the brush during the current stroke. */
  private stroke: Uint8Array | null = null;
  /** Pixels reached by the stroke's similar-colour flood fills. */
  private flooded: Uint8Array | null = null;
  private subtract = false;
  private last: Point | null = null;
  private frame = 0;

  private get size() {
    return this.editor.toolOptions.quickSelection.size;
  }

  protected get busy() {
    return this.stroke !== null;
  }

  protected cancel() {
    if (this.base) this.editor.setRegionMask(this.base);
    this.endStroke();
  }

  deactivate() {
    super.deactivate();
    this.editor.hideBrushCursor();
  }

  onPointerDown(ev: ToolPointerEvent) {
    const sel = this.editor.pixelSelection;
    this.pixels = this.editor.renderArtboardPixels();
    this.base = sel.getMask();
    this.stroke = new Uint8Array(sel.width * sel.height);
    this.flooded = new Uint8Array(sel.width * sel.height);
    this.subtract = ev.alt;
    this.last = ev.scenePoint;
    this.paintAt(ev.scenePoint);
    this.apply();
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.editor.showBrushCursor(ev.viewportPoint, this.size);
    if (!this.stroke || !this.last) return;
    // Stamp along the segment so fast strokes leave no gaps.
    const from = this.last;
    const to = ev.scenePoint;
    const step = Math.max(1, this.size / 4);
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let k = 1; k <= n; k++) {
      this.paintAt({ x: from.x + ((to.x - from.x) * k) / n, y: from.y + ((to.y - from.y) * k) / n });
    }
    this.last = to;
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.apply();
      });
    }
  }

  onPointerUp() {
    if (!this.stroke) return;
    this.apply();
    this.endStroke();
  }

  onOptionsChanged() {
    this.editor.hideBrushCursor();
  }

  private endStroke() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pixels = this.base = this.stroke = this.flooded = null;
    this.last = null;
  }

  /** Brush circle + similar-colour flood fill at one spot (artboard coordinates). */
  private paintAt(p: { x: number; y: number }) {
    const sel = this.editor.pixelSelection;
    const stroke = this.stroke;
    const flooded = this.flooded;
    const pixels = this.pixels;
    if (!stroke || !flooded || !pixels) return;
    const s = sel.scale;
    const cx = p.x * s;
    const cy = p.y * s;
    stampCircle(stroke, sel.width, sel.height, cx, cy, (this.size / 2) * s);
    const i = Math.floor(cx);
    const j = Math.floor(cy);
    if (i < 0 || j < 0 || i >= sel.width || j >= sel.height) return;
    // Spots inside an area already flooded would only find the same area again.
    if (flooded[j * sel.width + i]) return;
    floodFill(pixels.data, pixels.width, pixels.height, i, j, QUICK_SELECTION_TOLERANCE, flooded);
  }

  /** Selection = before-stroke selection plus (or minus) the stroke's area. */
  private apply() {
    if (!this.base || !this.stroke || !this.flooded) return;
    const out = this.base.slice();
    const stroke = this.stroke;
    const flooded = this.flooded;
    // `base` holds selection values 0–255; the stroke's own marks are 0/1.
    if (this.subtract) for (let k = 0; k < out.length; k++) out[k] = stroke[k] | flooded[k] ? 0 : out[k];
    else for (let k = 0; k < out.length; k++) out[k] = stroke[k] | flooded[k] ? 255 : out[k];
    this.editor.setRegionMask(out);
  }
}
