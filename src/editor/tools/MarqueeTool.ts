/**
 * Drag-to-select logic shared by the Rectangular and Elliptical Marquee
 * tools (each is its own tool class; they only differ in the shape made).
 *
 * - Drag: draws the selection box, its edges snapped to the pixel grid, with
 *   its live size next to the pointer.
 * - Keys held when the drag *starts* pick the selection mode (Shift = add,
 *   Alt = subtract, both = intersect; otherwise the options-bar mode).
 * - During the drag, Shift = square/circle and Alt = from the centre. A key
 *   already held at the start only takes that meaning after being released
 *   and pressed again (Photoshop's behaviour).
 * - A plain click (no drag) in New mode deselects.
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
  private startedWithAlt = false;
  private altReleased = false;
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
    this.startedWithAlt = ev.alt;
    this.altReleased = !ev.alt;
    this.moved = false;
    this.box = null;
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.pointer = ev.viewportPoint;
    if (!this.start || !this.startViewport) return;
    if (!ev.shift) this.shiftReleased = true;
    if (!ev.alt) this.altReleased = true;
    if (!this.moved && distance(ev.viewportPoint, this.startViewport) < DRAG_THRESHOLD) return;
    this.moved = true;
    const constrain = ev.shift && (!this.startedWithShift || this.shiftReleased);
    const fromCentre = ev.alt && (!this.startedWithAlt || this.altReleased);
    this.box = snapToPixels(dragBox(this.start, ev.scenePoint, constrain, fromCentre), constrain);
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp() {
    if (!this.start) return;
    const box = this.box;
    const mode = this.mode;
    const moved = this.moved;
    this.cancel();
    if (!moved || !box) this.clickWithoutShape(mode);
    else this.commitShape(this.shapeFor(box), mode);
    this.editor.canvas.requestRenderAll();
  }

  protected renderPreview(ctx: CanvasRenderingContext2D) {
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

/**
 * Snaps a box to the pixel grid: each edge goes to the nearest pixel
 * boundary (at least 1×1). A constrained (square) box keeps equal sides,
 * measured from its left/top edge.
 */
export function snapToPixels(b: Box, square: boolean): Box {
  const x0 = Math.round(b.x);
  const y0 = Math.round(b.y);
  let w = Math.max(1, Math.round(b.x + b.w) - x0);
  let h = Math.max(1, Math.round(b.y + b.h) - y0);
  if (square) w = h = Math.max(w, h);
  return { x: x0, y: y0, w, h };
}
