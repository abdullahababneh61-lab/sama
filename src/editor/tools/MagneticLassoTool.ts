/**
 * Magnetic Lasso tool (Alt+Shift+L): a lasso that clings to edges.
 *
 * - Click once to start, then just move the pointer (no need to hold the
 *   button) along the edge of what you want to select. The outline follows
 *   the strongest nearby contrast edge, not the exact pointer path.
 * - Anchor points are fixed automatically as you go (every ~40 artboard
 *   pixels of outline); click to fix one yourself at a tricky spot.
 * - Close: click the first point, double-click, or press Enter (the last
 *   stretch back to the start also follows edges).
 * - Backspace/Delete removes the last anchor; Esc cancels.
 * - Keys held on the first click pick the mode (Shift = add, Alt =
 *   subtract, both = intersect; otherwise the options-bar mode).
 * - A circle around the pointer shows how far it looks for an edge (the
 *   width), and the outline's live size shows next to it.
 *
 * How it finds edges: when you start, the artboard is rendered once and an
 * edge-strength map is computed from it (Sobel gradient of brightness). The
 * pointer snaps to the strongest edge within 10 px, and the outline between
 * anchors is the path of least resistance along edges ("live wire" /
 * intelligent scissors — see `edgeTrace.ts`). Edges are those of the
 * visible picture — shapes, text, paint and photos alike. Outside the
 * artboard there is nothing to follow, so the outline goes straight.
 */
import type { Point } from 'fabric';
import { RegionTool } from './RegionTool';
import type { ToolPointerEvent } from './Tool';
import { computeEdges, liveWire, pathLength, snapToEdge, type EdgeMap } from '../edgeTrace';
import type { CombineMode, XY } from '../pixelSelection';

/** Edge search radius (artboard px), like Photoshop's Width setting. */
const WIDTH = 10;
/** Outline length (artboard px) after which an anchor is fixed automatically. */
const FREQUENCY = 40;
const CLOSE_RADIUS = 8;

export class MagneticLassoTool extends RegionTool {
  readonly id = 'magneticLasso' as const;

  private edges: EdgeMap | null = null;
  /** Edge-map pixels per artboard pixel. */
  private scale = 1;
  /** Fixed outline so far (artboard coordinates). */
  private path: XY[] = [];
  /** Index in `path` of each anchor (the first is 0). */
  private anchors: number[] = [];
  /** Outline from the last anchor to the pointer (not yet fixed). */
  private live: XY[] = [];
  private hoverScene: Point | null = null;
  private hoverViewport: Point | null = null;
  private mode: CombineMode = 'replace';
  private frame = 0;

  protected get busy() {
    return this.path.length > 0;
  }

  protected cancel() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.edges = null;
    this.path = [];
    this.anchors = [];
    this.live = [];
  }

  onPointerDown(ev: ToolPointerEvent) {
    this.hoverScene = ev.scenePoint;
    this.hoverViewport = ev.viewportPoint;
    if (!this.path.length) {
      this.start(ev);
      return;
    }
    if (this.path.length >= 3 && this.nearFirst(ev.viewportPoint)) {
      this.close();
      return;
    }
    // Manual anchor: fix the outline up to the (snapped) pointer.
    this.updateLive();
    this.fixLive();
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.hoverScene = ev.scenePoint;
    this.hoverViewport = ev.viewportPoint;
    if (!this.path.length) {
      this.editor.canvas.requestRenderAll(); // move the width circle
      return;
    }
    if (this.frame) return;
    // Path finding runs at most once per frame.
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.path.length) return;
      this.updateLive();
      if (pathLength(this.live) > FREQUENCY) this.fixLive();
      this.editor.canvas.requestRenderAll();
    });
  }

  onDoubleClick() {
    if (this.path.length >= 3) this.close();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (this.path.length) {
      if (e.key === 'Enter') {
        if (this.path.length + this.live.length >= 3) this.close();
        return true;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        this.removeLastAnchor();
        return true;
      }
    }
    return super.onKeyDown(e);
  }

  protected get historyLabel() {
    return 'Magnetic Lasso';
  }

  protected renderPreview(ctx: CanvasRenderingContext2D) {
    // Edge-search width around the pointer (on the artboard only).
    const hv = this.hoverViewport;
    const hs = this.hoverScene;
    const { width, height } = this.editor.doc;
    if (hv && hs && hs.x >= 0 && hs.y >= 0 && hs.x < width && hs.y < height) {
      const r = WIDTH * this.editor.canvas.getZoom();
      ctx.save();
      ctx.beginPath();
      ctx.arc(hv.x, hv.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.stroke();
      ctx.restore();
    }
    if (!this.path.length) return;
    const fixed = this.toViewport(this.path);
    const live = this.toViewport(this.live);
    this.strokePreview(ctx, (c) => {
      fixed.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      live.forEach((p) => c.lineTo(p.x, p.y));
    });
    ctx.save();
    ctx.lineWidth = 1;
    for (let k = 0; k < this.anchors.length; k++) {
      const p = fixed[this.anchors[k]];
      const closing = k === 0 && this.path.length >= 3 && this.hoverViewport !== null && this.nearFirst(this.hoverViewport);
      const r = closing ? 5 : 3;
      ctx.fillStyle = closing ? '#4d8dff' : '#ffffff';
      ctx.strokeStyle = closing ? '#ffffff' : '#000000';
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      ctx.strokeRect(p.x - r + 0.5, p.y - r + 0.5, r * 2 - 1, r * 2 - 1);
    }
    ctx.restore();
    if (hv) this.drawLabel(ctx, this.sizeOf([...this.path, ...this.live]), hv);
  }

  // ---------------------------------------------------------------------------

  private start(ev: ToolPointerEvent) {
    this.mode = this.modeFor(ev);
    const pixels = this.editor.renderArtboardPixels();
    this.edges = computeEdges(pixels.data, pixels.width, pixels.height);
    this.scale = this.editor.pixelSelection.scale;
    const p = this.snap(ev.scenePoint);
    this.path = [p];
    this.anchors = [0];
    this.live = [];
    this.editor.canvas.requestRenderAll();
  }

  /** Recomputes the edge-following outline from the last anchor to the pointer. */
  private updateLive() {
    if (!this.edges || !this.hoverScene) return;
    const from = this.path[this.path.length - 1];
    const to = this.hoverScene;
    const { width, height } = this.editor.doc;
    const inside = (p: XY) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
    if (!inside(from) || !inside(to)) {
      // Nothing to follow off the artboard: go straight.
      this.live = [{ x: to.x, y: to.y }];
      return;
    }
    const s = this.scale;
    const target = this.snap(to);
    const wire = liveWire(this.edges, { x: from.x * s, y: from.y * s }, { x: target.x * s, y: target.y * s });
    // The wire starts at the anchor itself, which is already in `path`.
    this.live = wire.slice(1).map((p) => ({ x: p.x / s, y: p.y / s }));
  }

  /** Makes the live outline permanent, with an anchor at its end. */
  private fixLive() {
    if (!this.live.length) return;
    this.path.push(...this.live);
    this.anchors.push(this.path.length - 1);
    this.live = [];
  }

  private removeLastAnchor() {
    if (this.anchors.length <= 1) {
      this.cancel();
    } else {
      this.anchors.pop();
      this.path = this.path.slice(0, this.anchors[this.anchors.length - 1] + 1);
      this.updateLive();
    }
    this.editor.canvas.requestRenderAll();
  }

  private close() {
    if (this.edges && this.path.length) {
      // Follow edges back to the first point.
      this.hoverScene = null;
      const s = this.scale;
      this.fixLive();
      const last = this.path[this.path.length - 1];
      const first = this.path[0];
      const { width, height } = this.editor.doc;
      if (last.x >= 0 && last.y >= 0 && last.x < width && last.y < height) {
        const wire = liveWire(this.edges, { x: last.x * s, y: last.y * s }, { x: first.x * s, y: first.y * s });
        this.path.push(...wire.slice(1, -1).map((p) => ({ x: p.x / s, y: p.y / s })));
      }
    }
    const points = this.path;
    const mode = this.mode;
    this.cancel();
    if (points.length >= 3) this.commitShape({ type: 'polygon', points }, mode);
    this.editor.canvas.requestRenderAll();
  }

  /** The strongest edge within WIDTH of a scene point (the point itself off the artboard). */
  private snap(p: XY): XY {
    const { width, height } = this.editor.doc;
    if (!this.edges || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) return { x: p.x, y: p.y };
    const s = this.scale;
    const q = snapToEdge(this.edges, p.x * s, p.y * s, WIDTH * s);
    return { x: q.x / s, y: q.y / s };
  }

  private nearFirst(viewportPoint: { x: number; y: number }) {
    const f = this.editor.sceneToViewport(this.path[0]);
    return Math.hypot(viewportPoint.x - f.x, viewportPoint.y - f.y) <= CLOSE_RADIUS;
  }
}
