/**
 * Lasso tool (Q): drag to draw a freehand selection.
 *
 * - The pointer's path is sampled as you drag (a new point whenever it moves
 *   at least one screen pixel — the same sampling approach as the brush) and
 *   drawn live, with a thin line back to the start showing how it will close.
 * - Releasing the button closes the shape automatically.
 * - Shift when starting adds to the existing selection; otherwise the new
 *   shape replaces it. Esc cancels a lasso in progress (or clears the
 *   selection). A click without dragging deselects.
 */
import type { Point } from 'fabric';
import { RegionTool } from './RegionTool';
import type { ToolPointerEvent } from './Tool';
import type { CombineMode, XY } from '../pixelSelection';

/** Minimum pointer travel (screen px) between samples. */
const SAMPLE_SPACING = 1.5;

export class LassoTool extends RegionTool {
  readonly id = 'lasso' as const;

  private points: XY[] = [];
  private lastViewport: Point | null = null;
  private mode: CombineMode = 'replace';

  protected get busy() {
    return this.points.length > 0;
  }

  protected cancel() {
    this.points = [];
    this.lastViewport = null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    this.points = [{ x: ev.scenePoint.x, y: ev.scenePoint.y }];
    this.lastViewport = ev.viewportPoint;
    this.mode = this.modeFor(ev);
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.points.length || !this.lastViewport) return;
    const d = Math.hypot(ev.viewportPoint.x - this.lastViewport.x, ev.viewportPoint.y - this.lastViewport.y);
    if (d < SAMPLE_SPACING) return;
    this.points.push({ x: ev.scenePoint.x, y: ev.scenePoint.y });
    this.lastViewport = ev.viewportPoint;
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp() {
    if (!this.points.length) return;
    const points = this.points;
    const mode = this.mode;
    this.cancel();
    if (points.length < 3 || polygonArea(points) < 1) {
      if (mode === 'replace') this.editor.clearPixelSelection();
    } else {
      this.editor.selectRegion({ type: 'polygon', points }, mode);
    }
    this.editor.canvas.requestRenderAll();
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (this.points.length < 2) return;
    const pts = this.toViewport(this.points);
    this.strokePreview(ctx, (c) => {
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    });
    // Where it will close.
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.lineTo(pts[0].x, pts[0].y);
    ctx.stroke();
    ctx.restore();
  }
}

/** Absolute area of a polygon (shoelace formula). */
export function polygonArea(points: XY[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}
