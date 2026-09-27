/**
 * Shared behaviour of the tools that make region ("marching ants")
 * selections: the marquees, the lassos and Quick Selection.
 *
 * - A new selection replaces the current one; holding Shift when it starts
 *   adds to it instead (each tool decides what "start" means).
 * - Esc cancels a selection being drawn; with nothing in progress it clears
 *   the selection (and, with no selection either, falls through to the
 *   global Esc, which deselects layers).
 * - Delete/Backspace with a region selection deletes what's inside the
 *   selection's exact shape (pixels of image layers; vector layers the
 *   selection fully covers) and clears the selection — see
 *   `Editor.deleteInPixelSelection`. The artboard size never changes.
 *
 * The selection itself lives in `Editor.pixelSelection` and persists when
 * switching tools, like in Photoshop.
 */
import type { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import type { CombineMode, XY } from '../pixelSelection';

export abstract class RegionTool extends Tool {
  readonly selectsRegion = true;
  cursor = 'crosshair';

  /** True while a selection is being drawn. */
  protected abstract get busy(): boolean;
  /** Drops the selection being drawn (the existing selection is unchanged). */
  protected abstract cancel(): void;

  deactivate() {
    if (this.busy) this.cancel();
    this.editor.canvas.requestRenderAll();
  }

  /** Shift at the start of a selection adds to the existing one. */
  protected modeFor(ev: ToolPointerEvent): CombineMode {
    return ev.shift ? 'add' : 'replace';
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
      if (!e.repeat) void this.editor.deleteInPixelSelection();
      return true;
    }
    return false;
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

  /** Small dark label next to the pointer (e.g. "120 × 80"). */
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
}
