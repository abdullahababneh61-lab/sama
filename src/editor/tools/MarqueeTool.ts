/**
 * Drag-to-select logic shared by the Rectangular and Elliptical Marquee
 * tools (each is its own tool class; they only differ in the shape made).
 *
 * - Drag: draws the selection box (snapped to whole artboard pixels).
 * - Shift: square/circle. Holding Shift when the drag *starts* adds to the
 *   existing selection instead; to also constrain the shape, release and
 *   press Shift again during the drag (Photoshop's behaviour).
 * - Alt/Option: draw from the centre.
 * - A plain click (no drag) clears the selection.
 */
import type { Point } from 'fabric';
import { RegionTool } from './RegionTool';
import type { ToolPointerEvent } from './Tool';
import { dragBox, distance, type Box } from '../geometry';
import type { CombineMode, SelectionShape } from '../pixelSelection';

/** Pointer travel (screen px) that turns a click into a drag. */
const DRAG_THRESHOLD = 3;

export abstract class MarqueeTool extends RegionTool {
  private start: Point | null = null;
  private startViewport: Point | null = null;
  private box: Box | null = null;
  private mode: CombineMode = 'replace';
  private startedWithShift = false;
  private shiftReleased = false;
  private moved = false;
  private pointer: Point | null = null;

  /** The selection shape for a drag box (artboard coordinates). */
  protected abstract shapeFor(box: Box): SelectionShape;
  /** Draws the shape outline for the preview (viewport coordinates). */
  protected abstract tracePreview(ctx: CanvasRenderingContext2D, box: Box): void;

  protected get busy() {
    return this.start !== null;
  }

  protected cancel() {
    this.start = this.startViewport = this.box = null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    this.start = ev.scenePoint;
    this.startViewport = ev.viewportPoint;
    this.mode = this.modeFor(ev);
    this.startedWithShift = ev.shift;
    this.shiftReleased = !ev.shift;
    this.moved = false;
    this.box = null;
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.pointer = ev.viewportPoint;
    if (!this.start || !this.startViewport) return;
    if (!ev.shift) this.shiftReleased = true;
    if (!this.moved && distance(ev.viewportPoint, this.startViewport) < DRAG_THRESHOLD) return;
    this.moved = true;
    const constrain = ev.shift && (!this.startedWithShift || this.shiftReleased);
    this.box = snapToPixels(dragBox(this.start, ev.scenePoint, constrain, ev.alt), constrain);
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp() {
    if (!this.start) return;
    const box = this.box;
    const mode = this.mode;
    const moved = this.moved;
    this.cancel();
    if (!moved || !box) {
      // A plain click deselects (Shift+click keeps the selection).
      if (mode === 'replace') this.editor.clearPixelSelection();
    } else {
      this.editor.selectRegion(this.shapeFor(box), mode);
    }
    this.editor.canvas.requestRenderAll();
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    const box = this.box;
    if (!box) return;
    this.strokePreview(ctx, (c) => this.tracePreview(c, box));
    if (this.pointer) this.drawLabel(ctx, `${Math.round(box.w)} × ${Math.round(box.h)}`, this.pointer);
  }

  /** Viewport rectangle of a scene box. */
  protected viewportBox(box: Box) {
    const a = this.editor.sceneToViewport({ x: box.x, y: box.y });
    const b = this.editor.sceneToViewport({ x: box.x + box.w, y: box.y + box.h });
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }
}

/** Rounds a box to whole artboard pixels (at least 1×1); a square stays square. */
function snapToPixels(b: Box, square: boolean): Box {
  const w = Math.max(1, Math.round(b.w));
  const h = square ? w : Math.max(1, Math.round(b.h));
  return { x: Math.round(b.x), y: Math.round(b.y), w, h };
}
