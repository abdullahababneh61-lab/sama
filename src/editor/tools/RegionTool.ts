/**
 * Shared behaviour of the tools that make region ("marching ants")
 * selections: the marquees, the lassos and Quick Selection.
 *
 * - Selection mode (Photoshop's model, see selectionModes.ts): the tool's
 *   New / Add / Subtract / Intersect mode from the options bar, overridden
 *   for one gesture by the keys held when it starts — Shift = add,
 *   Alt/Option = subtract, Shift+Alt = intersect.
 * - The cursor shows the mode the next gesture will use (+, −, × badge) and
 *   follows the modifier keys as they're pressed.
 * - Every finished selection is one undo step; right after it, the
 *   selection's size flashes next to it for a moment.
 * - Esc cancels a selection being drawn; with nothing in progress it clears
 *   the selection (and, with no selection either, falls through to the
 *   global Esc, which deselects layers).
 * - Delete/Backspace with a region selection shows a notice instead of
 *   deleting the selected *layers*, which would be surprising here.
 *
 * The selection itself lives in `Editor.pixelSelection` and persists when
 * switching tools, like in Photoshop.
 */
import type { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import type { CombineMode, SelectionShape, XY } from '../pixelSelection';
import { combineModeFor, resolveSelectionMode } from '../selectionModes';
import { crosshairCursor } from '../cursors';
import { ModeCursor } from './modeCursor';
import type { SelectionMode } from '../types';

/** How long the size of a new selection stays on screen (ms). */
const FLASH_MS = 1600;

export abstract class RegionTool extends Tool {
  readonly selectsRegion = true;
  cursor = crosshairCursor('new');

  private flash: { text: string; until: number } | null = null;
  private flashTimer = 0;
  /** Shows the mode the next gesture would use, following Shift/Alt. */
  private readonly modeCursor = new ModeCursor(
    this.editor,
    (mods) => this.cursorFor(this.gestureMode(mods)),
    () => this.busy,
  );

  /** True while a selection is being drawn. */
  protected abstract get busy(): boolean;
  /** Drops the selection being drawn (the existing selection is unchanged). */
  protected abstract cancel(): void;
  /** Transient visuals of the selection being drawn (viewport coordinates). */
  protected renderPreview(_ctx: CanvasRenderingContext2D): void {}

  activate() {
    this.modeCursor.start();
  }

  deactivate() {
    if (this.busy) this.cancel();
    this.modeCursor.stop();
    window.clearTimeout(this.flashTimer);
    this.flash = null;
    this.editor.canvas.requestRenderAll();
  }

  onOptionsChanged() {
    this.modeCursor.refresh();
  }

  /** The tool's mode as picked in the options bar. */
  protected get toolMode(): SelectionMode {
    return this.editor.selectionModeOf(this.id);
  }

  /** The selection mode of a gesture starting now (modifier keys override the tool's mode). */
  protected gestureMode(mods: { shift: boolean; alt: boolean }): SelectionMode {
    return resolveSelectionMode(this.toolMode, mods);
  }

  /** The pixel-mask operation for a gesture starting with `ev`. */
  protected modeFor(ev: ToolPointerEvent): CombineMode {
    return combineModeFor(this.gestureMode(ev));
  }

  /** Cursor for the mode the next gesture would use. Tools with their own cursor override it. */
  protected cursorFor(mode: SelectionMode): string {
    return crosshairCursor(mode);
  }

  /** Name of the undo step for a selection made with this tool. */
  protected get historyLabel(): string {
    return 'Selection';
  }

  /** Applies a finished shape to the selection (one undo step) and shows its size. */
  protected commitShape(shape: SelectionShape, mode: CombineMode) {
    this.editor.selectRegion(shape, mode, this.historyLabel);
    this.flashSize();
  }

  /** A click without a drag: deselects in New mode (one undo step), nothing otherwise. */
  protected clickWithoutShape(mode: CombineMode) {
    if (mode === 'replace') this.editor.clearPixelSelection();
  }

  /** Shows the current selection's size next to it for a moment. */
  protected flashSize() {
    const b = this.editor.pixelSelection.bounds();
    window.clearTimeout(this.flashTimer);
    if (!b) {
      this.flash = null;
      return;
    }
    this.flash = { text: `${Math.round(b.width)} × ${Math.round(b.height)}`, until: performance.now() + FLASH_MS };
    this.flashTimer = window.setTimeout(() => {
      this.flash = null;
      this.editor.canvas.requestRenderAll();
    }, FLASH_MS);
    this.editor.canvas.requestRenderAll();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      if (this.busy) {
        this.cancel();
        this.editor.canvas.requestRenderAll();
        return true;
      }
      if (!this.editor.pixelSelection.isEmpty) {
        this.editor.clearPixelSelection();
        return true;
      }
      return false;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !this.editor.pixelSelection.isEmpty) {
      this.editor.notify('toast.regionDeleteUnsupported');
      return true;
    }
    return false;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    this.renderPreview(ctx);
    // The new selection's size, just below its bottom-right corner.
    const b = this.editor.pixelSelection.bounds();
    if (this.flash && b && !this.busy && performance.now() < this.flash.until) {
      const p = this.editor.sceneToViewport({ x: b.x + b.width, y: b.y + b.height });
      this.drawLabel(ctx, this.flash.text, { x: p.x - 14, y: p.y - 4 });
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers for in-progress outlines (viewport coordinates).

  /** Strokes a path with the static black/white dash used for previews. */
  protected strokePreview(ctx: CanvasRenderingContext2D, build: (ctx: CanvasRenderingContext2D) => void) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.beginPath();
    build(ctx);
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.strokeStyle = '#000000';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }

  /** Scene points → viewport points. */
  protected toViewport(points: XY[]): Point[] {
    return points.map((p) => this.editor.sceneToViewport(p));
  }

  /** Small dark label below-right of a point (e.g. "120 × 80"). */
  protected drawLabel(ctx: CanvasRenderingContext2D, text: string, at: XY) {
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 10;
    const x = at.x + 14;
    const y = at.y + 14;
    ctx.fillStyle = 'rgba(12, 12, 15, 0.85)';
    ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y + 9);
    ctx.restore();
  }

  /** "W × H" of a set of scene points (live size of a lasso being drawn). */
  protected sizeOf(points: XY[]): string {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    return `${Math.round(x1 - x0)} × ${Math.round(y1 - y0)}`;
  }
}
