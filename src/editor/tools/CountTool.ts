/**
 * Count tool (N), like Photoshop's Count tool: click each item to count it.
 *
 * - Click: add a numbered marker. Numbers follow placement order (1, 2, 3…).
 * - Drag a marker: move it (its number doesn't change).
 * - Alt/Option+click a marker: remove it; later markers are renumbered so the
 *   count stays gap-free (remove 3 of 5 → 4 and 5 become 3 and 4).
 * - Esc: hide the markers (they're kept; click again or come back to the tool
 *   to show them).
 * - The running total shows in the options bar, with a Clear all button.
 *
 * Markers are kept in the workspace store, in artboard coordinates — the same
 * persistence as the Color Sampler: they survive switching tools but aren't
 * part of the drawing, its undo history or its export. A marker's number is
 * its position in the list, so renumbering after a removal is automatic.
 */
import type { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { createId } from '../meta';
import type { CountMarker } from '../types';

/** Screen radius (px) of a marker; it widens for numbers with more digits. */
const MARKER_RADIUS = 10;
const HIT_RADIUS = 12;
const MARKER_COLOR = '#e5484d';

export class CountTool extends Tool {
  readonly id = 'count' as const;
  cursor = 'crosshair';

  /** Id of the marker being dragged. */
  private dragging: string | null = null;

  activate() {
    this.editor.store.setState({ countVisible: true });
    this.editor.canvas.requestRenderAll();
  }

  deactivate() {
    this.dragging = null;
    this.editor.canvas.requestRenderAll();
  }

  private get markers(): CountMarker[] {
    return this.editor.state.countMarkers;
  }

  private setMarkers(markers: CountMarker[]) {
    this.editor.store.setState({ countMarkers: markers });
    this.editor.canvas.requestRenderAll();
  }

  onPointerDown(ev: ToolPointerEvent) {
    const wasHidden = !this.editor.state.countVisible;
    this.editor.store.setState({ countVisible: true });
    const hit = wasHidden ? null : this.hitMarker(ev.viewportPoint);
    if (hit) {
      if (ev.alt) this.removeMarker(hit.id);
      else {
        this.dragging = hit.id;
        this.editor.setCursor('grabbing');
      }
      return;
    }
    if (ev.alt) return; // Alt+click on empty canvas does nothing.
    const { x, y } = ev.scenePoint;
    this.setMarkers([...this.markers, { id: createId('n'), x, y }]);
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (this.dragging === null) {
      const hover = this.editor.state.countVisible && this.hitMarker(ev.viewportPoint);
      this.editor.setCursor(hover ? (ev.alt ? 'pointer' : 'grab') : this.cursor);
      return;
    }
    const { x, y } = ev.scenePoint;
    const id = this.dragging;
    this.setMarkers(this.markers.map((m) => (m.id === id ? { ...m, x, y } : m)));
  }

  onPointerUp(ev: ToolPointerEvent) {
    if (this.dragging === null) return;
    this.dragging = null;
    this.editor.setCursor(this.hitMarker(ev.viewportPoint) ? 'grab' : this.cursor);
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.editor.state.countVisible && this.markers.length) {
      this.dragging = null;
      this.editor.store.setState({ countVisible: false });
      this.editor.canvas.requestRenderAll();
      return true;
    }
    return false;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.editor.state.countVisible) return;
    ctx.save();
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.markers.forEach((m, i) => {
      const p = this.editor.sceneToViewport(m);
      const label = String(i + 1);
      const r = Math.max(MARKER_RADIUS, ctx.measureText(label).width / 2 + 5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_COLOR;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, p.x, p.y + 0.5);
    });
    ctx.restore();
  }

  /** Removes a marker; the ones after it move up a number. */
  removeMarker(id: string) {
    this.setMarkers(this.markers.filter((m) => m.id !== id));
  }

  clearMarkers() {
    this.setMarkers([]);
  }

  // ---------------------------------------------------------------------------

  /** The top-most (last placed) marker under the pointer. */
  private hitMarker(viewportPoint: Point): CountMarker | null {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const p = this.editor.sceneToViewport(this.markers[i]);
      if (Math.hypot(p.x - viewportPoint.x, p.y - viewportPoint.y) <= HIT_RADIUS) return this.markers[i];
    }
    return null;
  }
}
