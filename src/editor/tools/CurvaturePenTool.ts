/**
 * Curvature Pen (Shift+~): draw smooth curves just by clicking points — the
 * curve through them is worked out automatically, with no Bézier handles to
 * drag. (Photoshop's Curvature Pen and Illustrator's Curvature tool, merged.)
 *
 * - Click: add a point. With 3 or more points the path is a smooth curve
 *   through all of them; a dashed preview shows the curve with a point at
 *   the pointer before you click.
 * - Drag a point (a new one while placing it, or any earlier one): move it;
 *   the curve follows live.
 * - Double-click a point: switch it between smooth and a sharp corner
 *   (double-clicking empty canvas therefore adds a corner). Alt+click adds a
 *   corner straight away. Smooth points are drawn as circles, corners as
 *   squares.
 * - Click the first point (3+ points): close the shape. Enter: finish an
 *   open path. Esc: cancel. Backspace/Delete (or Ctrl/Cmd+Z): remove the last
 *   point. Switching tools finishes an open path.
 *
 * Uses the Pen tool's fill/stroke settings. The result is an ordinary vector
 * path (one undo step "Curvature path"), editable afterwards with Direct
 * Selection (A) like any pen path.
 */
import { Path } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { anchorsToPathData, curvatureAnchors, type CurveAnchor, type XY } from '../pathShapes';

/** Screen-space radius (px) for hitting points (same as the Pen tool). */
const HIT_RADIUS = 7;
/** Pointer travel (screen px) before a press on a point becomes a drag. */
const DRAG_THRESHOLD = 3;

export class CurvaturePenTool extends Tool {
  readonly id = 'curvaturePen' as const;
  cursor = 'crosshair';

  private points: XY[] = [];
  private corners: boolean[] = [];
  /** Point being pressed/dragged, and where the press started (viewport). */
  private press: { index: number; from: XY; moved: boolean; added: boolean } | null = null;
  private hover: XY | null = null;
  /** Index of the point under the pointer, or -1. */
  private hoverIndex = -1;

  get isDrawing() {
    return this.points.length > 0;
  }

  deactivate() {
    this.finish(false);
    this.hover = null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    const hit = this.pointAt(ev.viewportPoint);
    if (hit >= 0) {
      this.press = { index: hit, from: ev.viewportPoint, moved: false, added: false };
      return;
    }
    this.points.push({ x: ev.scenePoint.x, y: ev.scenePoint.y });
    this.corners.push(ev.alt);
    // Holding the button after placing a point moves it.
    this.press = { index: this.points.length - 1, from: ev.viewportPoint, moved: false, added: true };
    this.hoverIndex = this.points.length - 1;
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.hover = { x: ev.scenePoint.x, y: ev.scenePoint.y };
    const press = this.press;
    if (press) {
      if (!press.moved && Math.hypot(ev.viewportPoint.x - press.from.x, ev.viewportPoint.y - press.from.y) >= DRAG_THRESHOLD) press.moved = true;
      if (press.moved) this.points[press.index] = { x: ev.scenePoint.x, y: ev.scenePoint.y };
    } else {
      this.hoverIndex = this.pointAt(ev.viewportPoint);
      this.editor.setCursor(this.hoverIndex >= 0 ? 'move' : this.cursor);
    }
    if (this.points.length) this.editor.canvas.requestRenderAll();
  }

  onPointerUp() {
    const press = this.press;
    this.press = null;
    if (!press) return;
    // A click (no drag) on the first point closes the shape.
    if (!press.moved && !press.added && press.index === 0 && this.points.length >= 3) this.finish(true);
    this.editor.canvas.requestRenderAll();
  }

  onDoubleClick(ev: ToolPointerEvent) {
    const hit = this.pointAt(ev.viewportPoint);
    if (hit < 0) return;
    this.corners[hit] = !this.corners[hit];
    this.editor.canvas.requestRenderAll();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (!this.isDrawing) return false;
    if (e.key === 'Enter') {
      this.finish(false);
      return true;
    }
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this.undoLastPoint();
      return true;
    }
    return false;
  }

  /** Removes the last point while drawing. Returns false when not drawing. */
  undoLastPoint(): boolean {
    if (!this.isDrawing) return false;
    this.points.pop();
    this.corners.pop();
    this.press = null;
    this.hoverIndex = -1;
    this.editor.canvas.requestRenderAll();
    return true;
  }

  /** Drops the path being drawn. */
  cancel() {
    this.points = [];
    this.corners = [];
    this.press = null;
    this.hoverIndex = -1;
    this.editor.setCursor(this.cursor);
    this.editor.canvas.requestRenderAll();
  }

  /** Turns the points into a Path layer (needs 2 points; 3 to close). */
  finish(closed: boolean) {
    const points = this.points;
    const corners = this.corners;
    this.cancel();
    if (points.length < 2) return;
    const shut = closed && points.length >= 3;
    const opts = this.editor.toolOptions.pen;
    const path = new Path(anchorsToPathData(curvatureAnchors(points, corners, shut), shut), {
      fill: shut ? opts.fill ?? '' : '',
      stroke: opts.stroke ?? (shut ? '' : '#1f1f24'),
      strokeWidth: opts.strokeWidth,
      strokeUniform: true,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    });
    path.samaKind = 'path';
    this.editor.addLayer(path);
    this.editor.commit('Curvature path');
  }

  /** Index of the placed point under a viewport position, or -1. */
  private pointAt(v: XY): number {
    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.editor.sceneToViewport(this.points[i]);
      if (Math.hypot(p.x - v.x, p.y - v.y) <= HIT_RADIUS) return i;
    }
    return -1;
  }

  /** The path as it would be with the pointer as the next point (when not over a point). */
  private previewAnchors(): { anchors: CurveAnchor[]; closed: boolean; ghost: boolean } {
    const closing = !this.press && this.hoverIndex === 0 && this.points.length >= 3;
    if (closing) return { anchors: curvatureAnchors(this.points, this.corners, true), closed: true, ghost: false };
    const ghost = !this.press && this.hoverIndex < 0 && this.hover !== null;
    const pts = ghost ? [...this.points, this.hover!] : this.points;
    const corners = ghost ? [...this.corners, false] : this.corners;
    return { anchors: curvatureAnchors(pts, corners, false), closed: false, ghost };
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.points.length) return;
    const toV = (p: XY) => this.editor.sceneToViewport(p);
    const accent = '#4d8dff';
    const opts = this.editor.toolOptions.pen;
    const { anchors, closed, ghost } = this.previewAnchors();
    const trace = (list: CurveAnchor[], shut: boolean) => {
      ctx.beginPath();
      const f = toV(list[0].p);
      ctx.moveTo(f.x, f.y);
      const seg = (a: CurveAnchor, b: CurveAnchor) => {
        const c1 = toV(a.out);
        const c2 = toV(b.in);
        const e = toV(b.p);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y);
      };
      for (let i = 1; i < list.length; i++) seg(list[i - 1], list[i]);
      if (shut) seg(list[list.length - 1], list[0]);
    };
    ctx.save();
    // The placed points' curve, with its real stroke under a thin guide line…
    const body = ghost ? curvatureAnchors(this.points, this.corners, false) : anchors;
    if (body.length > 1) {
      trace(body, closed);
      if (opts.stroke && opts.strokeWidth > 0) {
        ctx.strokeStyle = opts.stroke;
        ctx.lineWidth = opts.strokeWidth * this.editor.canvas.getZoom();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // …and a dashed preview of the curve with a point at the pointer.
    if (ghost && anchors.length > 1) {
      trace(anchors, false);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Points: circles = smooth, squares = corners; the first one highlights when a click would close.
    this.points.forEach((p, i) => {
      const v = toV(p);
      const hot = i === this.hoverIndex || this.press?.index === i;
      const r = hot ? 5 : 4;
      ctx.beginPath();
      if (this.corners[i]) ctx.rect(v.x - r + 0.5, v.y - r + 0.5, r * 2 - 1, r * 2 - 1);
      else ctx.arc(v.x, v.y, r - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = hot ? accent : '#ffffff';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    });
    if (closed) {
      const v = toV(this.points[0]);
      ctx.beginPath();
      ctx.arc(v.x, v.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.stroke();
    }
    ctx.restore();
  }
}

