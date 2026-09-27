/**
 * Quick Selection tool (Shift+W): paint to select similar areas.
 *
 * - From each spot the brush passes over, the selection grows into the
 *   colours similar to the one under the brush's centre (averaged over a
 *   small patch, so photo noise doesn't throw it off): the similar pixels
 *   under the brush, plus a contiguous flood fill of similar pixels around
 *   it (tolerance 32 per channel). It stops at colour edges — the brush
 *   never selects across a boundary just because it overlaps it.
 * - Mode: Add by default (painting extends the selection); New starts
 *   afresh with each stroke; Alt/Option+paint subtracts, Shift+paint adds.
 * - Size in the options bar, or [ and ]. On first use the size is set from
 *   the artboard (about 1/35 of its shorter side), so it suits the picture.
 * - The round cursor shows the brush size, with the mode's sign inside.
 * - Each stroke is one undo step. Esc cancels a stroke in progress,
 *   otherwise clears the selection.
 *
 * Works on the pixels of the visible picture (the artboard is rendered once
 * per stroke), so it applies to any artwork — shapes, text, paint, photos.
 */
import type { Point } from 'fabric';
import { RegionTool } from './RegionTool';
import type { ToolPointerEvent } from './Tool';
import { averageColor, floodFill } from '../pixelSelection';
import type { ScenePixels } from '../scenePixels';
import type { SelectionMode } from '../types';

/** Colour similarity (0–255 per channel). */
export const QUICK_SELECTION_TOLERANCE = 32;
/** Default brush size = shorter artboard side ÷ this (clamped). */
const AUTO_SIZE_DIVISOR = 35;

/** A brush size that suits an artboard of this size. */
export function autoQuickSelectionSize(width: number, height: number): number {
  return Math.max(8, Math.min(250, Math.round(Math.min(width, height) / AUTO_SIZE_DIVISOR)));
}

export class QuickSelectionTool extends RegionTool {
  readonly id = 'quickSelection' as const;

  private pixels: ScenePixels | null = null;
  /** Selection before the stroke started (restored by Esc). */
  private base: Uint8Array | null = null;
  /** Similar pixels under the brush during the current stroke. */
  private stroke: Uint8Array | null = null;
  /** Pixels reached by the stroke's similar-colour flood fills. */
  private flooded: Uint8Array | null = null;
  private mode: SelectionMode = 'add';
  private last: Point | null = null;
  private frame = 0;
  /** The size last set automatically (null until the first use). */
  private autoSize: number | null = null;
  private offOut: (() => void) | null = null;

  private get size() {
    return this.editor.toolOptions.quickSelection.size;
  }

  protected get historyLabel() {
    return 'Quick Selection';
  }

  protected get busy() {
    return this.stroke !== null;
  }

  protected cancel() {
    if (this.base) this.editor.setRegionMask(this.base);
    this.endStroke();
  }

  activate() {
    super.activate();
    // Size the brush for this artboard, unless the user has picked a size.
    const { width, height } = this.editor.doc;
    const auto = autoQuickSelectionSize(width, height);
    const untouched = this.autoSize === null ? this.size === DEFAULT_SIZE : this.size === this.autoSize;
    if (untouched && this.size !== auto) this.editor.updateToolOptions('quickSelection', { size: auto });
    if (untouched) this.autoSize = auto;
    this.offOut = this.editor.canvas.on('mouse:out', () => this.editor.hideBrushCursor());
  }

  deactivate() {
    super.deactivate();
    this.offOut?.();
    this.offOut = null;
    this.editor.hideBrushCursor();
  }

  /** Quick Selection only adds or subtracts: Shift+Alt (intersect elsewhere) adds. */
  protected gestureMode(mods: { shift: boolean; alt: boolean }): SelectionMode {
    const mode = super.gestureMode(mods);
    return mode === 'intersect' ? 'add' : mode;
  }

  /** The DOM brush circle is the cursor (with the mode sign inside). */
  protected cursorFor(mode: SelectionMode): string {
    this.editor.setBrushCursorMode(mode === 'subtract' ? 'subtract' : mode === 'new' ? null : 'add');
    return 'none';
  }

  onPointerDown(ev: ToolPointerEvent) {
    const sel = this.editor.pixelSelection;
    this.mode = this.gestureMode(ev);
    this.pixels = this.editor.renderArtboardPixels();
    // New: each stroke starts a fresh selection.
    this.base = this.mode === 'new' ? new Uint8Array(sel.width * sel.height) : sel.getMask();
    this.stroke = new Uint8Array(sel.width * sel.height);
    this.flooded = new Uint8Array(sel.width * sel.height);
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
    this.editor.commit(this.historyLabel);
    this.flashSize();
  }

  onOptionsChanged() {
    super.onOptionsChanged();
    this.editor.hideBrushCursor();
  }

  private endStroke() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pixels = this.base = this.stroke = this.flooded = null;
    this.last = null;
  }

  /** Similar pixels under the brush + a similar-colour flood fill, at one spot (artboard coordinates). */
  private paintAt(p: { x: number; y: number }) {
    const sel = this.editor.pixelSelection;
    const { stroke, flooded, pixels } = this;
    if (!stroke || !flooded || !pixels) return;
    const w = sel.width;
    const h = sel.height;
    const s = sel.scale;
    const cx = p.x * s;
    const cy = p.y * s;
    const i0 = Math.floor(cx);
    const j0 = Math.floor(cy);
    if (i0 < 0 || j0 < 0 || i0 >= w || j0 >= h) return;
    const seed = averageColor(pixels.data, w, h, i0, j0, 2);
    const tol = QUICK_SELECTION_TOLERANCE;
    const d = pixels.data;
    const similar = (i: number) => {
      const q = i * 4;
      return (
        Math.abs(d[q] - seed[0]) <= tol &&
        Math.abs(d[q + 1] - seed[1]) <= tol &&
        Math.abs(d[q + 2] - seed[2]) <= tol &&
        Math.abs(d[q + 3] - seed[3]) <= tol
      );
    };
    // The brush circle — only where the colour matches.
    const r = (this.size / 2) * s;
    for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(h - 1, Math.ceil(cy + r)); j++) {
      const dy = j + 0.5 - cy;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const a = Math.max(0, Math.ceil(cx - half - 0.5));
      const b = Math.min(w, Math.floor(cx + half - 0.5) + 1);
      for (let i = a; i < b; i++) if (similar(j * w + i)) stroke[j * w + i] = 1;
    }
    // Spots inside an area already flooded would only find the same area again.
    if (flooded[j0 * w + i0] || !similar(j0 * w + i0)) return;
    floodFill(d, w, h, i0, j0, tol, flooded, seed);
  }

  /** Selection = before-stroke selection plus (or minus) the stroke's area. */
  private apply() {
    if (!this.base || !this.stroke || !this.flooded) return;
    const out = this.base.slice();
    const { stroke, flooded } = this;
    // `base` holds selection values 0–255; the stroke's own marks are 0/1.
    if (this.mode === 'subtract') for (let k = 0; k < out.length; k++) out[k] = stroke[k] | flooded[k] ? 0 : out[k];
    else for (let k = 0; k < out.length; k++) out[k] = stroke[k] | flooded[k] ? 255 : out[k];
    this.editor.setRegionMask(out);
  }
}

/** The store's initial Quick Selection size (replaced by the automatic size on first use). */
const DEFAULT_SIZE = 24;
