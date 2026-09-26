/**
 * Pen tool (P): draws real vector paths made of anchor points and cubic
 * Bézier curves, like the pen in Illustrator/Photoshop.
 *
 * - Click: add a corner anchor (straight segment).
 * - Click and drag: add a smooth anchor; dragging pulls out symmetric handles.
 *   Hold Alt while dragging to move only the outgoing handle (a cusp).
 * - Shift: constrain the new anchor (or handle) to 45° angles.
 * - Click the first anchor: close the path.
 * - Click the last anchor, press Enter or Esc, or switch tools: finish an
 *   open path.
 * - Backspace or Ctrl/Cmd+Z: remove the last anchor while drawing.
 *
 * Finished paths are normal Fabric `Path` objects whose anchors can later be
 * edited with the Direct Selection tool (A).
 */
import { Path, Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { constrainTo45, distance } from '../geometry';

interface Anchor {
  p: Point;
  /** Incoming handle (absolute scene coordinates). */
  in: Point;
  /** Outgoing handle (absolute scene coordinates). */
  out: Point;
}

/** Screen-space radius (px) for hitting anchors. */
const HIT_RADIUS = 7;

export function anchorsToPathData(anchors: Anchor[], closed: boolean): string {
  if (!anchors.length) return '';
  const f = (n: number) => Math.round(n * 100) / 100;
  const parts = [`M ${f(anchors[0].p.x)} ${f(anchors[0].p.y)}`];
  const seg = (a: Anchor, b: Anchor) =>
    `C ${f(a.out.x)} ${f(a.out.y)} ${f(b.in.x)} ${f(b.in.y)} ${f(b.p.x)} ${f(b.p.y)}`;
  for (let i = 1; i < anchors.length; i++) parts.push(seg(anchors[i - 1], anchors[i]));
  if (closed && anchors.length > 2) {
    parts.push(seg(anchors[anchors.length - 1], anchors[0]));
    parts.push('Z');
  }
  return parts.join(' ');
}

export class PenTool extends Tool {
  readonly id = 'pen' as const;
  cursor = 'crosshair';

  private anchors: Anchor[] = [];
  private dragging = false;
  private hover: Point | null = null;
  private overFirst = false;

  deactivate() {
    this.finish(false);
    this.hover = null;
  }

  get isDrawing() {
    return this.anchors.length > 0;
  }

  private hitRadiusScene() {
    return HIT_RADIUS / this.editor.canvas.getZoom();
  }

  onPointerDown(ev: ToolPointerEvent) {
    let p = ev.scenePoint;
    const last = this.anchors[this.anchors.length - 1];
    if (ev.shift && last) p = constrainTo45(last.p, p);

    // Close the path by clicking its first anchor.
    if (this.anchors.length > 2 && distance(p, this.anchors[0].p) <= this.hitRadiusScene()) {
      this.finish(true);
      return;
    }
    // Clicking the last anchor again finishes an open path.
    if (last && distance(p, last.p) <= this.hitRadiusScene()) {
      this.finish(false);
      return;
    }
    this.anchors.push({ p, in: p, out: p });
    this.dragging = true;
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    const a = this.anchors[this.anchors.length - 1];
    if (this.dragging && a) {
      let h = ev.scenePoint;
      if (ev.shift) h = constrainTo45(a.p, h);
      a.out = h;
      // Symmetric handles unless Alt is held (Alt breaks the handle pair).
      if (!ev.alt) a.in = new Point(2 * a.p.x - h.x, 2 * a.p.y - h.y);
    } else {
      let p = ev.scenePoint;
      const last = this.anchors[this.anchors.length - 1];
      if (ev.shift && last) p = constrainTo45(last.p, p);
      this.hover = p;
      this.overFirst = this.anchors.length > 2 && distance(p, this.anchors[0].p) <= this.hitRadiusScene();
    }
    if (this.anchors.length) this.editor.canvas.requestRenderAll();
  }

  onPointerUp() {
    this.dragging = false;
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (!this.isDrawing) return false;
    if (e.key === 'Enter' || e.key === 'Escape') {
      this.finish(false);
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this.undoLastAnchor();
      return true;
    }
    return false;
  }

  /** Removes the last anchor while drawing. Returns false when not drawing. */
  undoLastAnchor(): boolean {
    if (!this.isDrawing) return false;
    this.anchors.pop();
    this.dragging = false;
    this.editor.canvas.requestRenderAll();
    return true;
  }

  /** Converts the anchors into a Path layer (needs at least 2 anchors). */
  finish(closed: boolean) {
    const anchors = this.anchors;
    this.anchors = [];
    this.dragging = false;
    this.overFirst = false;
    if (anchors.length < 2) {
      this.editor.canvas.requestRenderAll();
      return;
    }
    const opts = this.editor.toolOptions.pen;
    const path = new Path(anchorsToPathData(anchors, closed), {
      fill: closed ? opts.fill ?? '' : '',
      stroke: opts.stroke ?? (closed ? '' : '#1f1f24'),
      strokeWidth: opts.strokeWidth,
      strokeUniform: true,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    });
    path.samaKind = 'path';
    this.editor.addLayer(path);
    this.editor.commit('Pen path');
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.anchors.length) return;
    const toV = (p: Point) => this.editor.sceneToViewport(p);
    const opts = this.editor.toolOptions.pen;
    const accent = '#4d8dff';
    const anchors = this.anchors;

    // The path so far, drawn with its real stroke colour under a thin guide line.
    ctx.save();
    ctx.beginPath();
    const first = toV(anchors[0].p);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1];
      const b = anchors[i];
      const c1 = toV(a.out);
      const c2 = toV(b.in);
      const e = toV(b.p);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y);
    }
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

    // Rubber band from the last anchor to the pointer.
    const last = anchors[anchors.length - 1];
    if (!this.dragging && this.hover) {
      const target = this.overFirst ? anchors[0].p : this.hover;
      const c1 = toV(last.out);
      const e = toV(target);
      const c2 = this.overFirst ? toV(anchors[0].in) : e;
      ctx.beginPath();
      ctx.moveTo(toV(last.p).x, toV(last.p).y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = accent;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Handles of the last anchor.
    if (distance(last.in, last.p) > 0.01 || distance(last.out, last.p) > 0.01) {
      const p = toV(last.p);
      for (const h of [last.in, last.out]) {
        const v = toV(h);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(v.x, v.y);
        ctx.strokeStyle = accent;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(v.x, v.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
      }
    }

    // Anchors
    anchors.forEach((a, i) => {
      const v = toV(a.p);
      const s = i === 0 && this.overFirst ? 9 : 7;
      ctx.fillStyle = i === anchors.length - 1 ? accent : '#fff';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.fillRect(v.x - s / 2, v.y - s / 2, s, s);
      ctx.strokeRect(v.x - s / 2 + 0.5, v.y - s / 2 + 0.5, s - 1, s - 1);
    });
    if (this.overFirst) {
      const v = toV(anchors[0].p);
      ctx.beginPath();
      ctx.arc(v.x, v.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.stroke();
    }
    ctx.restore();
  }
}
