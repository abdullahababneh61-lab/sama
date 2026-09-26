/**
 * Crop tool (C): trims the artboard to a rectangle, like Photoshop's crop.
 *
 * - Drag to define the crop area (same drag as the Rectangle tool: Shift =
 *   square, Alt = from centre).
 * - Adjust it with the eight handles on its corners and edges, or drag inside
 *   it to move it. Dragging outside it starts a new crop area.
 * - The area that will be removed is shaded while you adjust.
 * - Enter applies the crop: layers entirely outside are deleted, layers that
 *   cross the edge are trimmed, and the artboard takes the crop's size.
 * - Esc cancels and leaves the document untouched.
 */
import { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { dragBox, type Box } from '../geometry';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Drag =
  | { mode: 'draw'; start: Point }
  | { mode: 'resize'; handle: Handle; startRect: Box; startPoint: Point }
  | { mode: 'move'; startRect: Box; startPoint: Point };

/** Screen-space size (px) of a handle, and how far from it a click still hits it. */
const HANDLE_SIZE = 8;
const HIT_RADIUS = 8;
/** A drag shorter than this (screen px) is a click, which clears the crop area. */
const CLICK_TOLERANCE = 3;
const SHADE = 'rgba(8, 8, 12, 0.6)';
const ACCENT = '#4d8dff';

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

export class CropTool extends Tool {
  readonly id = 'crop' as const;
  cursor = 'crosshair';

  /** The crop area in artboard coordinates, or null when idle. */
  private rect: Box | null = null;
  private drag: Drag | null = null;

  deactivate() {
    this.reset();
  }

  /** True while a crop area exists (being drawn or adjusted). */
  get isActive() {
    return !!this.rect;
  }

  private reset() {
    this.rect = null;
    this.drag = null;
    this.editor.setCursor(this.cursor);
    this.editor.canvas.requestRenderAll();
  }

  onPointerDown(ev: ToolPointerEvent) {
    const p = ev.scenePoint;
    if (this.rect) {
      const handle = this.hitHandle(ev.viewportPoint);
      if (handle) {
        this.drag = { mode: 'resize', handle, startRect: { ...this.rect }, startPoint: p };
        return;
      }
      if (this.contains(p)) {
        this.drag = { mode: 'move', startRect: { ...this.rect }, startPoint: p };
        this.editor.setCursor('move');
        return;
      }
    }
    // Start a new crop area.
    this.drag = { mode: 'draw', start: p };
    this.rect = dragBox(p, p, ev.shift, ev.alt);
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    const p = ev.scenePoint;
    const drag = this.drag;
    if (!drag) {
      this.updateHoverCursor(ev);
      return;
    }
    if (drag.mode === 'draw') {
      this.rect = dragBox(drag.start, p, ev.shift, ev.alt);
    } else if (drag.mode === 'move') {
      const r = drag.startRect;
      this.rect = { ...r, x: r.x + p.x - drag.startPoint.x, y: r.y + p.y - drag.startPoint.y };
    } else {
      this.rect = resizeBox(drag.startRect, drag.handle, p.x - drag.startPoint.x, p.y - drag.startPoint.y);
    }
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp(ev: ToolPointerEvent) {
    const drag = this.drag;
    this.drag = null;
    if (drag?.mode === 'draw') {
      const a = this.editor.sceneToViewport(drag.start);
      const moved = Math.hypot(ev.viewportPoint.x - a.x, ev.viewportPoint.y - a.y);
      // A plain click (no drag) clears the crop area instead of making a 1px one.
      if (moved < CLICK_TOLERANCE) this.rect = null;
    }
    this.updateHoverCursor(ev);
    this.editor.canvas.requestRenderAll();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (!this.rect) return false;
    if (e.key === 'Enter') {
      const rect = this.rect;
      this.reset();
      this.editor.cropArtboard(rect);
      return true;
    }
    if (e.key === 'Escape') {
      this.reset();
      return true;
    }
    return false;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.rect) return;
    const { x, y, w, h } = this.toViewport(this.rect);
    const cw = this.editor.canvas.width;
    const ch = this.editor.canvas.height;

    ctx.save();
    // Shade everything outside the crop area (even-odd fill leaves a hole).
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.rect(x, y, w, h);
    ctx.fillStyle = SHADE;
    ctx.fill('evenodd');

    // Rule-of-thirds guides inside the crop area.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const gx = Math.round(x + (w * i) / 3) + 0.5;
      const gy = Math.round(y + (h * i) / 3) + 0.5;
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
    }
    ctx.stroke();

    // Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));

    // Handles
    const s = HANDLE_SIZE;
    for (const [, hp] of this.handlePositions()) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = ACCENT;
      ctx.fillRect(hp.x - s / 2, hp.y - s / 2, s, s);
      ctx.strokeRect(hp.x - s / 2 + 0.5, hp.y - s / 2 + 0.5, s - 1, s - 1);
    }

    // Size readout under the crop area.
    const label = `${Math.round(this.rect.w)} × ${Math.round(this.rect.h)} px`;
    ctx.font = '600 11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const lx = x + w / 2 - tw / 2 - 6;
    const ly = Math.min(y + h + 10, ch - 24);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(lx, ly, tw + 12, 18);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + 6, ly + 9);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------

  private toViewport(r: Box): Box {
    const a = this.editor.sceneToViewport({ x: r.x, y: r.y });
    const b = this.editor.sceneToViewport({ x: r.x + r.w, y: r.y + r.h });
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }

  private contains(p: Point) {
    const r = this.rect!;
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  /** Handle centres in viewport coordinates. */
  private handlePositions(): [Handle, Point][] {
    const { x, y, w, h } = this.toViewport(this.rect!);
    const cx = x + w / 2;
    const cy = y + h / 2;
    return [
      ['nw', new Point(x, y)],
      ['n', new Point(cx, y)],
      ['ne', new Point(x + w, y)],
      ['e', new Point(x + w, cy)],
      ['se', new Point(x + w, y + h)],
      ['s', new Point(cx, y + h)],
      ['sw', new Point(x, y + h)],
      ['w', new Point(x, cy)],
    ];
  }

  private hitHandle(viewportPoint: Point): Handle | null {
    if (!this.rect) return null;
    let best: Handle | null = null;
    let bestDist = HIT_RADIUS;
    for (const [handle, hp] of this.handlePositions()) {
      const d = Math.hypot(hp.x - viewportPoint.x, hp.y - viewportPoint.y);
      if (d <= bestDist) {
        best = handle;
        bestDist = d;
      }
    }
    return best;
  }

  private updateHoverCursor(ev: ToolPointerEvent) {
    if (!this.rect) return this.editor.setCursor(this.cursor);
    const handle = this.hitHandle(ev.viewportPoint);
    if (handle) this.editor.setCursor(CURSORS[handle]);
    else if (this.contains(ev.scenePoint)) this.editor.setCursor('move');
    else this.editor.setCursor(this.cursor);
  }
}

/**
 * Moves the edges named by `handle` by (dx, dy). Dragging an edge past the
 * opposite one flips the box instead of giving it a negative size.
 */
export function resizeBox(r: Box, handle: Handle, dx: number, dy: number): Box {
  let left = r.x;
  let top = r.y;
  let right = r.x + r.w;
  let bottom = r.y + r.h;
  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;
  const x = Math.min(left, right);
  const y = Math.min(top, bottom);
  return { x, y, w: Math.max(1, Math.abs(right - left)), h: Math.max(1, Math.abs(bottom - top)) };
}
