/**
 * Ruler tool (R): measures distance and angle, like Photoshop's Ruler tool.
 *
 * - Drag to draw a measurement line; its length (in px, the unit used across
 *   the workspace) and angle show in a label next to it.
 * - Shift constrains the line to 45° steps.
 * - Drag either end of an existing line to adjust it.
 * - Esc clears the line.
 *
 * The line is an on-screen measurement only: it isn't a layer, isn't exported
 * and isn't part of undo. It stays while you use the tool and is still there
 * when you come back to it.
 *
 * The angle is measured from horizontal, counter-clockwise positive (a line
 * rising to the right reads +45°), matching Photoshop.
 */
import { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { constrainTo45 } from '../geometry';

interface Measurement {
  start: Point;
  end: Point;
}

/** Screen radius (px) around an end point that grabs it. */
const HIT_RADIUS = 9;
/** A drag shorter than this (screen px) counts as a click and clears the line. */
const CLICK_TOLERANCE = 3;
const LINE_COLOR = '#ffb020';

/** Length (artboard px) and angle (degrees, −180…180, counter-clockwise) of a line. */
export function measure(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  // Screen y grows downwards; flip it so "up" is a positive angle. `|| 0`
  // turns -0 into 0, so a leftward horizontal line reads 180°, not −180°.
  const angle = (Math.atan2(-dy || 0, dx) * 180) / Math.PI || 0;
  return { length, angle, dx, dy };
}

export class RulerTool extends Tool {
  readonly id = 'ruler' as const;
  cursor = 'crosshair';

  private line: Measurement | null = null;
  /** Which end is being dragged ('end' while drawing a new line). */
  private dragging: 'start' | 'end' | null = null;
  private dragOrigin: Point | null = null;

  activate() {
    this.editor.canvas.requestRenderAll();
  }

  deactivate() {
    this.dragging = null;
    this.editor.canvas.requestRenderAll();
  }

  /** The current measurement, for tests and future UI (null when none). */
  get measurement() {
    return this.line ? { ...measure(this.line.start, this.line.end), start: this.line.start, end: this.line.end } : null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    const handle = this.hitEnd(ev.viewportPoint);
    if (handle) {
      this.dragging = handle;
      return;
    }
    // Start a new measurement.
    this.line = { start: ev.scenePoint, end: ev.scenePoint };
    this.dragging = 'end';
    this.dragOrigin = ev.viewportPoint;
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.dragging || !this.line) {
      this.editor.setCursor(this.hitEnd(ev.viewportPoint) ? 'move' : this.cursor);
      return;
    }
    const fixed = this.dragging === 'end' ? this.line.start : this.line.end;
    const p = ev.shift ? constrainTo45(fixed, ev.scenePoint) : ev.scenePoint;
    if (this.dragging === 'end') this.line.end = p;
    else this.line.start = p;
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp(ev: ToolPointerEvent) {
    if (this.dragOrigin && this.line) {
      const moved = Math.hypot(ev.viewportPoint.x - this.dragOrigin.x, ev.viewportPoint.y - this.dragOrigin.y);
      // A plain click (no drag) clears the measurement.
      if (moved < CLICK_TOLERANCE) this.line = null;
    }
    this.dragging = null;
    this.dragOrigin = null;
    this.editor.canvas.requestRenderAll();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.line) {
      this.line = null;
      this.dragging = null;
      this.dragOrigin = null;
      this.editor.canvas.requestRenderAll();
      return true;
    }
    return false;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.line) return;
    const a = this.editor.sceneToViewport(this.line.start);
    const b = this.editor.sceneToViewport(this.line.end);
    const { length, angle } = measure(this.line.start, this.line.end);
    ctx.save();

    // Horizontal reference and angle arc at the start point.
    if (length > 0) {
      const ref = Math.min(40, Math.hypot(b.x - a.x, b.y - a.y));
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + ref, a.y);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      const r = Math.max(12, ref * 0.6);
      const rad = (-angle * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, Math.min(0, rad), Math.max(0, rad));
      ctx.strokeStyle = LINE_COLOR;
      ctx.stroke();
    }

    // The measurement line: dark under-stroke so it reads on light and dark art.
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // End points (crosses in circles, grabbable).
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Label: length · angle, offset to the side of the line's midpoint.
    const label = `${formatNumber(length)} px  ·  ${formatNumber(angle)}°`;
    ctx.font = '600 11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Perpendicular offset (to the upper side of the line).
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const w = tw + 12;
    const h = 20;
    // Push the label off the line by its own half-extent along the normal.
    const offset = (Math.abs(nx) * w) / 2 + (Math.abs(ny) * h) / 2 + 8;
    const cw = this.editor.canvas.width;
    const ch = this.editor.canvas.height;
    const lx = Math.min(cw - w - 4, Math.max(4, mx + nx * offset - w / 2));
    const ly = Math.min(ch - h - 4, Math.max(4, my + ny * offset - h / 2));
    ctx.fillStyle = 'rgba(12, 12, 15, 0.9)';
    ctx.fillRect(lx, ly, w, h);
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(lx + 0.5, ly + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + 6, ly + h / 2);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------

  private hitEnd(viewportPoint: Point): 'start' | 'end' | null {
    if (!this.line) return null;
    const ds = this.distance(this.line.start, viewportPoint);
    const de = this.distance(this.line.end, viewportPoint);
    if (Math.min(ds, de) > HIT_RADIUS) return null;
    return de <= ds ? 'end' : 'start';
  }

  private distance(scenePoint: Point, viewportPoint: Point) {
    const v = this.editor.sceneToViewport(scenePoint);
    return Math.hypot(v.x - viewportPoint.x, v.y - viewportPoint.y);
  }
}

/** One decimal, without a trailing ".0". */
function formatNumber(n: number) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
