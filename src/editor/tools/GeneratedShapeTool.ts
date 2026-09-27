/**
 * Shared behaviour of the tools that draw generated line art by dragging —
 * Arc / Spiral and Grid:
 *
 * - Drag to draw; a live preview (with the real stroke) follows the pointer.
 *   Release to create the layer (one undo step); it is then selected.
 * - A click without dragging creates a default-sized shape at that point,
 *   like the shape tools.
 * - Esc while dragging cancels.
 * - Changing a setting in the options bar (spiral turns, grid rows…) also
 *   rebuilds the selected shape made with this tool, so settings can be
 *   adjusted before or after drawing.
 */
import type { FabricObject, Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { rebuildGenerated, type LineStyle } from '../generatedShapes';
import type { ShapeParams } from '../types';

/** Pointer travel (screen px) before a press counts as a drag. */
const DRAG_THRESHOLD = 3;

export interface DragState {
  start: Point;
  /** Current pointer; null for a click (default size). */
  end: Point | null;
  shift: boolean;
  alt: boolean;
}

export abstract class GeneratedShapeTool extends Tool {
  cursor = 'crosshair';

  private start: Point | null = null;
  private current: Point | null = null;
  private moved = false;
  private shift = false;
  private alt = false;

  /** Stroke used for new shapes. */
  protected abstract get style(): LineStyle;
  /** SVG path data (scene coordinates) previewing the shape for a drag. */
  protected abstract previewPath(drag: DragState): string;
  /** The layer for a finished drag (null: nothing to create). */
  protected abstract create(drag: DragState): FabricObject | null;
  /** Name of the undo step for a new shape. */
  protected abstract historyLabel(obj: FabricObject): string;
  /** The options-bar numbers that shape a drawn layer (spiral turns, grid rows…). */
  protected abstract settings(): Record<string, number>;
  /** A selected shape's settings with the options-bar numbers that just changed applied, or null when not affected. */
  protected abstract applySettings(current: ShapeParams, changed: Record<string, number>): ShapeParams | null;
  /** Name of the undo step for changing a drawn shape's settings. */
  protected abstract get settingsLabel(): string;

  /** Settings as last seen, to tell which one the user just changed. */
  private seen: Record<string, number> | null = null;

  activate() {
    this.seen = this.settings();
  }

  deactivate() {
    this.reset();
  }

  private reset() {
    this.start = this.current = null;
    this.moved = false;
  }

  private drag(): DragState | null {
    if (!this.start) return null;
    return { start: this.start, end: this.moved ? this.current : null, shift: this.shift, alt: this.alt };
  }

  onPointerDown(ev: ToolPointerEvent) {
    // A settings change still waiting to be recorded gets its own undo step.
    this.editor.flushDebouncedCommit();
    this.start = this.current = ev.scenePoint;
    this.moved = false;
    this.shift = ev.shift;
    this.alt = ev.alt;
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.start) return;
    const s = this.editor.sceneToViewport(this.start);
    if (!this.moved && Math.hypot(ev.viewportPoint.x - s.x, ev.viewportPoint.y - s.y) > DRAG_THRESHOLD) this.moved = true;
    this.current = ev.scenePoint;
    this.shift = ev.shift;
    this.alt = ev.alt;
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp(ev: ToolPointerEvent) {
    if (!this.start) return;
    if (this.moved) {
      this.current = ev.scenePoint;
      this.shift = ev.shift;
      this.alt = ev.alt;
    }
    const drag = this.drag()!;
    this.reset();
    const obj = this.create(drag);
    this.editor.canvas.requestRenderAll();
    if (!obj) return;
    this.editor.addLayer(obj);
    this.editor.commit(this.historyLabel(obj));
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.start) {
      this.reset();
      this.editor.canvas.requestRenderAll();
      return true;
    }
    return false;
  }

  onOptionsChanged() {
    // Only the numbers that just changed are applied to the selected shape
    // (changing e.g. the stroke colour must not reset its rows).
    const now = this.settings();
    const changed: Record<string, number> = {};
    for (const k of Object.keys(now)) if (now[k] !== this.seen?.[k]) changed[k] = now[k];
    this.seen = now;
    const objs = this.editor.canvas.getActiveObjects();
    const obj = objs.length === 1 ? objs[0] : null;
    const params = obj?.samaParams && Object.keys(changed).length ? this.applySettings(obj.samaParams, changed) : null;
    if (obj && params) {
      const kept = rebuildGenerated(obj, params, this.style);
      if (kept !== obj) {
        this.editor.replaceLayer(obj, kept);
        this.editor.selectObjects([kept]);
      }
      this.editor.commitDebounced(this.settingsLabel);
    }
    this.editor.canvas.requestRenderAll();
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    const drag = this.drag();
    if (!drag?.end) return;
    const d = this.previewPath(drag);
    if (!d) return;
    const v = this.editor.canvas.viewportTransform;
    const zoom = this.editor.canvas.getZoom();
    const path = new Path2D(d);
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([v[0], v[1], v[2], v[3], v[4], v[5]])));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const { stroke, strokeWidth } = this.style;
    if (strokeWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke(path);
    }
    // A thin accent line on top, so the preview reads even with a pale stroke.
    ctx.strokeStyle = '#4d8dff';
    ctx.lineWidth = 1 / zoom;
    ctx.stroke(path);
    ctx.restore();
  }
}
