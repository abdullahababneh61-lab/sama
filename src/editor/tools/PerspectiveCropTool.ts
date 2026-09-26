/**
 * Perspective Crop tool (Shift+C), like Photoshop's Perspective Crop.
 *
 * - Drag to define an initial crop rectangle (same drag as the Rectangle and
 *   Crop tools: Shift = square, Alt = from centre).
 * - Drag any of the four corner handles on its own to turn the rectangle into
 *   a quadrilateral that follows the perspective in the artwork (e.g. the
 *   edges of a photographed poster). Drag inside it to move it; drag outside
 *   it to start again.
 * - Outside the quadrilateral is shaded; a perspective grid shows how the
 *   content will be straightened. The outline turns red if the shape can't be
 *   corrected (crossed or bent inwards).
 * - Enter straightens the quadrilateral into a rectangle, crops to it and
 *   resizes the artboard. Esc cancels without changing anything.
 */
import { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { dragBox } from '../geometry';
import { applyHomography, computeHomography, correctedSize, isValidQuad, type XY } from '../perspective';

type Drag =
  | { mode: 'draw'; start: Point }
  | { mode: 'corner'; index: number }
  | { mode: 'move'; startCorners: XY[]; startPoint: Point };

const HANDLE_SIZE = 9;
const HIT_RADIUS = 9;
const CLICK_TOLERANCE = 3;
const SHADE = 'rgba(8, 8, 12, 0.6)';
const ACCENT = '#4d8dff';
const INVALID = '#ff5c63';
const GRID_LINES = 3;

export class PerspectiveCropTool extends Tool {
  readonly id = 'perspectiveCrop' as const;
  cursor = 'crosshair';

  /** Corners in artboard coordinates: top-left, top-right, bottom-right, bottom-left. */
  private corners: XY[] | null = null;
  private drag: Drag | null = null;
  private applying = false;

  deactivate() {
    this.reset();
  }

  private reset() {
    this.corners = null;
    this.drag = null;
    this.editor.setCursor(this.cursor);
    this.editor.canvas.requestRenderAll();
  }

  onPointerDown(ev: ToolPointerEvent) {
    if (this.applying) return;
    const p = ev.scenePoint;
    if (this.corners) {
      const index = this.hitCorner(ev.viewportPoint);
      if (index !== null) {
        this.drag = { mode: 'corner', index };
        return;
      }
      if (pointInPolygon(p, this.corners)) {
        this.drag = { mode: 'move', startCorners: this.corners.map((c) => ({ ...c })), startPoint: p };
        this.editor.setCursor('move');
        return;
      }
    }
    this.drag = { mode: 'draw', start: p };
    this.corners = boxCorners(dragBox(p, p, ev.shift, ev.alt));
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
      this.corners = boxCorners(dragBox(drag.start, p, ev.shift, ev.alt));
    } else if (drag.mode === 'corner' && this.corners) {
      this.corners[drag.index] = { x: p.x, y: p.y };
    } else if (drag.mode === 'move') {
      const dx = p.x - drag.startPoint.x;
      const dy = p.y - drag.startPoint.y;
      this.corners = drag.startCorners.map((c) => ({ x: c.x + dx, y: c.y + dy }));
    }
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp(ev: ToolPointerEvent) {
    const drag = this.drag;
    this.drag = null;
    if (drag?.mode === 'draw') {
      const a = this.editor.sceneToViewport(drag.start);
      if (Math.hypot(ev.viewportPoint.x - a.x, ev.viewportPoint.y - a.y) < CLICK_TOLERANCE) this.corners = null;
    }
    this.updateHoverCursor(ev);
    this.editor.canvas.requestRenderAll();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (!this.corners) return false;
    if (e.key === 'Enter') {
      if (this.applying) return true;
      if (!isValidQuad(this.corners)) {
        this.editor.notify('toast.perspectiveInvalid', 'warning');
        return true;
      }
      const quad = this.corners.map((c) => ({ ...c }));
      this.applying = true;
      void this.editor.perspectiveCropArtboard(quad).finally(() => {
        this.applying = false;
        this.reset();
      });
      return true;
    }
    if (e.key === 'Escape') {
      if (!this.applying) this.reset();
      return true;
    }
    return false;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.corners) return;
    const q = this.corners;
    const v = q.map((c) => this.editor.sceneToViewport(c));
    const valid = isValidQuad(q);
    const cw = this.editor.canvas.width;
    const ch = this.editor.canvas.height;

    ctx.save();
    // Shade everything outside the quadrilateral.
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(v[i].x, v[i].y);
    ctx.closePath();
    ctx.fillStyle = SHADE;
    ctx.fill('evenodd');

    // Perspective grid: straight lines of the corrected image, seen through the
    // same perspective (so their spacing shows the foreshortening).
    if (valid) {
      try {
        const unit = [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ];
        const H = computeHomography(unit, q);
        const at = (x: number, y: number) => {
          const p = applyHomography(H, { x, y });
          return p ? this.editor.sceneToViewport(p) : null;
        };
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < GRID_LINES; i++) {
          const t = i / GRID_LINES;
          for (const [a, b] of [
            [at(t, 0), at(t, 1)],
            [at(0, t), at(1, t)],
          ]) {
            if (!a || !b) continue;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        }
        ctx.stroke();
      } catch {
        // Degenerate shape: skip the grid.
      }
    }

    // Outline
    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(v[i].x, v[i].y);
    ctx.closePath();
    ctx.strokeStyle = valid ? '#ffffff' : INVALID;
    ctx.lineWidth = valid ? 1 : 2;
    ctx.stroke();

    // Corner handles
    const s = HANDLE_SIZE;
    for (const p of v) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = valid ? ACCENT : INVALID;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.strokeRect(p.x - s / 2 + 0.5, p.y - s / 2 + 0.5, s - 1, s - 1);
    }

    // Size of the corrected result, under the lowest corner.
    if (valid) {
      const { width, height } = correctedSize(q);
      const label = `${width} × ${height} px`;
      ctx.font = '600 11px system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const cx = (v[2].x + v[3].x) / 2;
      const ly = Math.min(Math.max(v[2].y, v[3].y) + 10, ch - 24);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(cx - tw / 2 - 6, ly, tw + 12, 18);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx - tw / 2, ly + 9);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------

  private hitCorner(viewportPoint: Point): number | null {
    if (!this.corners) return null;
    let best: number | null = null;
    let bestDist = HIT_RADIUS;
    this.corners.forEach((c, i) => {
      const v = this.editor.sceneToViewport(c);
      const d = Math.hypot(v.x - viewportPoint.x, v.y - viewportPoint.y);
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }

  private updateHoverCursor(ev: ToolPointerEvent) {
    if (!this.corners) return this.editor.setCursor(this.cursor);
    if (this.hitCorner(ev.viewportPoint) !== null) this.editor.setCursor('pointer');
    else if (pointInPolygon(ev.scenePoint, this.corners)) this.editor.setCursor('move');
    else this.editor.setCursor(this.cursor);
  }
}

function boxCorners(b: { x: number; y: number; w: number; h: number }): XY[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

/** Ray-casting point-in-polygon test (works for any simple polygon). */
function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
