/**
 * Polygonal Lasso tool (Shift+L): click to place straight-edged selection
 * points.
 *
 * - Click: add a point. A live segment follows the pointer from the last
 *   point, so you see the next edge before placing it.
 * - Close: click the first point (it highlights when the pointer is over
 *   it, like the Pen tool), double-click, or press Enter (at least 3 points).
 * - Backspace/Delete: remove the last point. Esc: cancel the whole shape.
 * - Shift while placing points constrains the edge to 45° steps; Shift on
 *   the *first* click adds the shape to the existing selection.
 */
import { Point } from 'fabric';
import { RegionTool } from './RegionTool';
import type { ToolPointerEvent } from './Tool';
import { constrainTo45 } from '../geometry';
import type { CombineMode, XY } from '../pixelSelection';

/** Screen distance (px) within which a click closes on the first point. */
const CLOSE_RADIUS = 8;

export class PolygonalLassoTool extends RegionTool {
  readonly id = 'polygonalLasso' as const;

  private points: Point[] = [];
  private hover: Point | null = null;
  private mode: CombineMode = 'replace';

  protected get busy() {
    return this.points.length > 0;
  }

  protected cancel() {
    this.points = [];
    this.hover = null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    if (!this.points.length) {
      this.mode = this.modeFor(ev);
      this.points = [ev.scenePoint];
      this.hover = ev.scenePoint;
      this.editor.canvas.requestRenderAll();
      return;
    }
    if (this.points.length >= 3 && this.nearFirst(ev.viewportPoint)) {
      this.close();
      return;
    }
    const p = this.constrained(ev);
    const last = this.editor.sceneToViewport(this.points[this.points.length - 1]);
    const pv = this.editor.sceneToViewport(p);
    // Ignore a repeated click on the same spot (e.g. the first half of a double-click).
    if (Math.hypot(pv.x - last.x, pv.y - last.y) >= 1) this.points.push(p);
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.points.length) return;
    this.hover = this.constrained(ev);
    this.editor.canvas.requestRenderAll();
  }

  onDoubleClick() {
    if (this.points.length >= 3) this.close();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (this.points.length) {
      if (e.key === 'Enter') {
        if (this.points.length >= 3) this.close();
        return true;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        this.points.pop();
        if (!this.points.length) this.cancel();
        this.editor.canvas.requestRenderAll();
        return true;
      }
    }
    return super.onKeyDown(e);
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.points.length) return;
    const pts = this.toViewport(this.points);
    const hover = this.hover ? this.editor.sceneToViewport(this.hover) : null;
    this.strokePreview(ctx, (c) => {
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      if (hover) c.lineTo(hover.x, hover.y);
    });
    // First point: a handle that highlights when a click would close the shape.
    const first = pts[0];
    const closing = this.points.length >= 3 && hover !== null && this.nearFirst(hover);
    ctx.save();
    ctx.fillStyle = closing ? '#4d8dff' : '#ffffff';
    ctx.strokeStyle = closing ? '#ffffff' : '#000000';
    ctx.lineWidth = 1;
    const r = closing ? 5 : 3.5;
    ctx.fillRect(first.x - r, first.y - r, r * 2, r * 2);
    ctx.strokeRect(first.x - r + 0.5, first.y - r + 0.5, r * 2 - 1, r * 2 - 1);
    ctx.restore();
  }

  private close() {
    const points = this.points.map((p) => ({ x: p.x, y: p.y }));
    const mode = this.mode;
    this.cancel();
    this.editor.selectRegion({ type: 'polygon', points: points as XY[] }, mode);
    this.editor.canvas.requestRenderAll();
  }

  private nearFirst(viewportPoint: { x: number; y: number }) {
    const f = this.editor.sceneToViewport(this.points[0]);
    return Math.hypot(viewportPoint.x - f.x, viewportPoint.y - f.y) <= CLOSE_RADIUS;
  }

  /** Pointer position, constrained to 45° from the last point while Shift is held. */
  private constrained(ev: ToolPointerEvent): Point {
    const last = this.points[this.points.length - 1];
    return ev.shift && last ? constrainTo45(last, ev.scenePoint) : ev.scenePoint;
  }
}
