/**
 * Color Sampler tool (O), like Photoshop's Color Sampler.
 *
 * Unlike the Eyedropper it never changes the active colours. It places up to
 * four numbered sample points on the artwork; a floating panel lists the
 * colour under each one and keeps it up to date as the artwork changes.
 *
 * - Click: place a sample point (numbered 1–4, reusing the lowest free number).
 *   A fifth click is ignored with a short notice.
 * - Drag a point: move it; its colour updates live.
 * - Alt/Option+click a point: remove it.
 * - Esc: hide the points and panel (they're kept; click again or come back to
 *   the tool to show them).
 *
 * Points live in the workspace store, in artboard coordinates. They survive
 * switching tools but are a viewing aid: they aren't part of the drawing, its
 * undo history or its export.
 */
import type { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { sampleSceneColor } from './EyedropperTool';
import type { ColorSample } from '../types';

export const MAX_COLOR_SAMPLES = 4;
/** Screen radius (px) of a sample marker, also its click target. */
const MARKER_RADIUS = 7;
const HIT_RADIUS = 10;

export class ColorSamplerTool extends Tool {
  readonly id = 'colorSampler' as const;
  cursor = 'crosshair';

  /** Number of the point being dragged. */
  private dragging: number | null = null;
  private frame = 0;
  private offHistory: (() => void) | null = null;

  activate() {
    this.editor.store.setState({ colorSamplerVisible: true });
    this.resampleAll();
    // Keep readings current when the artwork changes (any edit, undo or redo).
    let history = this.editor.state.history;
    let doc = this.editor.state.doc;
    this.offHistory = this.editor.store.subscribe((s) => {
      if (s.history !== history || s.doc !== doc) {
        history = s.history;
        doc = s.doc;
        this.scheduleResample();
      }
    });
    this.editor.canvas.requestRenderAll();
  }

  deactivate() {
    this.offHistory?.();
    this.offHistory = null;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.dragging = null;
    this.editor.canvas.requestRenderAll();
  }

  private get samples(): ColorSample[] {
    return this.editor.state.colorSamples;
  }

  private setSamples(samples: ColorSample[]) {
    this.editor.store.setState({ colorSamples: samples });
    this.editor.canvas.requestRenderAll();
  }

  onPointerDown(ev: ToolPointerEvent) {
    const wasHidden = !this.editor.state.colorSamplerVisible;
    this.editor.store.setState({ colorSamplerVisible: true });
    const hit = wasHidden ? null : this.hitSample(ev.viewportPoint);
    if (hit) {
      if (ev.alt) {
        this.setSamples(this.samples.filter((s) => s.id !== hit.id));
      } else {
        this.dragging = hit.id;
        this.editor.setCursor('grabbing');
      }
      return;
    }
    if (ev.alt) return; // Alt+click on empty canvas does nothing.
    if (this.samples.length >= MAX_COLOR_SAMPLES) {
      this.editor.notify('toast.colorSamplerLimit');
      return;
    }
    const used = new Set(this.samples.map((s) => s.id));
    let id = 1;
    while (used.has(id)) id++;
    const { x, y } = ev.scenePoint;
    const sample: ColorSample = { id, x, y, color: this.sampleAt(x, y) };
    this.setSamples([...this.samples, sample].sort((a, b) => a.id - b.id));
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (this.dragging === null) {
      const hover = this.editor.state.colorSamplerVisible && this.hitSample(ev.viewportPoint);
      this.editor.setCursor(hover ? (ev.alt ? 'pointer' : 'grab') : this.cursor);
      return;
    }
    const { x, y } = ev.scenePoint;
    const id = this.dragging;
    this.setSamples(this.samples.map((s) => (s.id === id ? { ...s, x, y, color: this.sampleAt(x, y) } : s)));
  }

  onPointerUp(ev: ToolPointerEvent) {
    if (this.dragging === null) return;
    this.dragging = null;
    this.editor.setCursor(this.hitSample(ev.viewportPoint) ? 'grab' : this.cursor);
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.editor.state.colorSamplerVisible && this.samples.length) {
      this.dragging = null;
      this.editor.store.setState({ colorSamplerVisible: false });
      this.editor.canvas.requestRenderAll();
      return true;
    }
    return false;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.editor.state.colorSamplerVisible) return;
    ctx.save();
    for (const s of this.samples) {
      const p = this.editor.sceneToViewport(s);
      const r = MARKER_RADIUS;
      // Target: dark and light rings so it reads on any colour, crosshair ticks.
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        ctx.moveTo(p.x + dx * (r - 3), p.y + dy * (r - 3));
        ctx.lineTo(p.x + dx * (r + 4), p.y + dy * (r + 4));
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      // Number tag
      const label = String(s.id);
      ctx.font = '700 10px system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const lx = p.x + r + 3;
      const ly = p.y + r - 2;
      ctx.fillStyle = '#4d8dff';
      ctx.fillRect(lx, ly, tw + 8, 14);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 4, ly + 7);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------

  private hitSample(viewportPoint: Point): ColorSample | null {
    let best: ColorSample | null = null;
    let bestDist = HIT_RADIUS;
    for (const s of this.samples) {
      const p = this.editor.sceneToViewport(s);
      const d = Math.hypot(p.x - viewportPoint.x, p.y - viewportPoint.y);
      if (d <= bestDist) {
        best = s;
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Colour at an artboard point. Sampled in artboard space at 100% (so the
   * reading doesn't depend on zoom, and works for points scrolled out of view).
   */
  private sampleAt(x: number, y: number): string | null {
    const canvas = this.editor.canvas;
    const skip = canvas.skipOffscreen;
    canvas.skipOffscreen = false;
    try {
      return sampleSceneColor(
        { canvas: { viewportTransform: [1, 0, 0, 1, 0, 0], getObjects: () => canvas.getObjects() }, doc: this.editor.doc },
        { x, y },
      );
    } finally {
      canvas.skipOffscreen = skip;
    }
  }

  private resampleAll() {
    if (!this.samples.length) return;
    this.setSamples(this.samples.map((s) => ({ ...s, color: this.sampleAt(s.x, s.y) })));
  }

  private scheduleResample() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.resampleAll();
    });
  }

  /** Removes one point (used by the panel's remove buttons). */
  removeSample(id: number) {
    this.setSamples(this.samples.filter((s) => s.id !== id));
  }

  clearSamples() {
    this.setSamples([]);
  }
}
