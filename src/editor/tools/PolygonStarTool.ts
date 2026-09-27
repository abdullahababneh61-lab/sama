/**
 * Polygon / Star tool (U, in the shape cycle): one toolbar tool with two
 * modes, picked in the options bar.
 *
 * - Press where the centre should be and drag outwards: the distance sets
 *   the size (centre to a corner/tip) and the direction sets the rotation —
 *   a corner (or star tip) points at the pointer.
 * - Shift locks the rotation upright: a star has a tip straight up; a
 *   polygon sits on a flat bottom edge (triangles and pentagons point up;
 *   squares and hexagons have flat tops).
 * - Polygon: "Sides" (default 5). Star: "Points" (default 5) and "Inner
 *   radius" (default 50 % — how deep the notches between the tips are).
 *   Changing them also rebuilds the selected polygon/star made with this
 *   tool (its own undo step), keeping its centre, size and rotation.
 * - A click without dragging makes a 100 px upright shape at that point;
 *   Esc while dragging cancels.
 *
 * Fill and stroke come from the shape tools' shared settings (the same as
 * Rectangle and Ellipse). The result is an ordinary polygon layer — select,
 * move, resize and rotate it with the Selection tool; Direct Selection can
 * edit its corners.
 */
import type { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { uprightAngle } from '../pathShapes';
import { createPolygonStar, isPolygonStar, polygonStarVertices, rebuildPolygonStar, withCount, type PolygonStarParams } from '../polygonStar';

/** Pointer travel (screen px) before a press counts as a drag. */
const DRAG_THRESHOLD = 3;
/** Radius of a shape made by a plain click. */
const DEFAULT_RADIUS = 50;

export class PolygonStarTool extends Tool {
  readonly id = 'polygonStar' as const;
  cursor = 'crosshair';

  private start: Point | null = null;
  private current: Point | null = null;
  private moved = false;
  private shift = false;
  /** Sides/points/inner radius as last seen, to tell which one just changed. */
  private seen: { sides: number; points: number; innerRatio: number } | null = null;

  private get options() {
    const o = this.editor.toolOptions.polygonStar;
    return {
      mode: o.mode,
      sides: Math.max(3, Math.min(100, Math.round(o.sides) || 3)),
      points: Math.max(2, Math.min(100, Math.round(o.points) || 2)),
      innerRatio: Math.max(1, Math.min(100, o.innerRatio || 50)),
    };
  }

  activate() {
    const { sides, points, innerRatio } = this.options;
    this.seen = { sides, points, innerRatio };
  }

  deactivate() {
    this.start = this.current = null;
    this.moved = false;
  }

  /** The shape a press/drag describes. */
  private paramsFor(start: Point, end: Point | null, shift: boolean): PolygonStarParams {
    const o = this.options;
    const star = o.mode === 'star';
    const count = star ? o.points : o.sides;
    let radius = DEFAULT_RADIUS;
    let angle = uprightAngle(count, star);
    if (end) {
      radius = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
      if (!shift) angle = Math.atan2(end.y - start.y, end.x - start.x);
    }
    return star ? { type: 'star', points: o.points, innerRatio: o.innerRatio, radius, angle } : { type: 'polygon', sides: o.sides, radius, angle };
  }

  onPointerDown(ev: ToolPointerEvent) {
    this.editor.flushDebouncedCommit();
    this.start = this.current = ev.scenePoint;
    this.moved = false;
    this.shift = ev.shift;
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.start) return;
    const s = this.editor.sceneToViewport(this.start);
    if (!this.moved && Math.hypot(ev.viewportPoint.x - s.x, ev.viewportPoint.y - s.y) > DRAG_THRESHOLD) this.moved = true;
    this.current = ev.scenePoint;
    this.shift = ev.shift;
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp(ev: ToolPointerEvent) {
    if (!this.start) return;
    const start = this.start;
    const params = this.paramsFor(start, this.moved ? ev.scenePoint : null, this.moved ? ev.shift : true);
    this.start = this.current = null;
    this.moved = false;
    const shape = createPolygonStar(start, params, this.editor.toolOptions.shape);
    this.editor.addLayer(shape);
    this.editor.commit(params.type === 'star' ? 'Star' : 'Polygon');
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.start) {
      this.start = this.current = null;
      this.moved = false;
      this.editor.canvas.requestRenderAll();
      return true;
    }
    return false;
  }

  onOptionsChanged() {
    // Only a number that just changed is applied to the selected shape
    // (e.g. changing the fill must not reset its sides).
    const { sides, points, innerRatio } = this.options;
    const was = this.seen;
    this.seen = { sides, points, innerRatio };
    const objs = this.editor.canvas.getActiveObjects();
    const obj = objs.length === 1 ? objs[0] : null;
    if (was && isPolygonStar(obj)) {
      const p = obj.samaParams;
      let next: PolygonStarParams | null = null;
      if (p.type === 'polygon' && sides !== was.sides && sides !== p.sides) next = withCount(p, sides);
      if (p.type === 'star' && (points !== was.points || innerRatio !== was.innerRatio)) {
        const counted = points !== was.points ? withCount(p, points) : p;
        next = { ...counted, innerRatio: innerRatio !== was.innerRatio ? innerRatio : p.innerRatio } as PolygonStarParams;
      }
      if (next) {
        rebuildPolygonStar(obj, next);
        this.editor.commitDebounced(next.type === 'star' ? 'Star settings' : 'Polygon sides');
      }
    }
    this.editor.canvas.requestRenderAll();
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.start || !this.moved || !this.current) return;
    const c = this.start;
    const pts = polygonStarVertices(this.paramsFor(c, this.current, this.shift));
    const path = new Path2D();
    pts.forEach((p, i) => (i ? path.lineTo(c.x + p.x, c.y + p.y) : path.moveTo(c.x + p.x, c.y + p.y)));
    path.closePath();
    const v = this.editor.canvas.viewportTransform;
    const zoom = this.editor.canvas.getZoom();
    const { fill, stroke, strokeWidth } = this.editor.toolOptions.shape;
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([v[0], v[1], v[2], v[3], v[4], v[5]])));
    ctx.lineJoin = 'miter';
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill(path);
    }
    if (stroke && strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke(path);
    }
    // Thin accent outline on top, plus the radius the drag is setting.
    ctx.strokeStyle = '#4d8dff';
    ctx.lineWidth = 1 / zoom;
    ctx.stroke(path);
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + pts[0].x, c.y + pts[0].y);
    ctx.stroke();
    ctx.restore();
  }
}
