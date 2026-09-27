/**
 * Object Selection tool (W): select whole layers by clicking them or by
 * drawing a box around them.
 *
 * - Click a layer: selects it (the whole top-level layer — a group is
 *   selected as one object, like the Selection tool). Click empty canvas to
 *   deselect.
 * - Drag a box: selects the layers that are mostly inside it — every layer
 *   with at least half of its bounding box covered by the box. That takes
 *   in layers fully contained and layers significantly overlapping, and
 *   leaves out ones the box only grazes.
 * - Mode (options bar): New, Add, Subtract or Intersect. Keys held when
 *   the click/drag starts override it: Shift = add, Alt/Option = subtract,
 *   Shift+Alt = intersect. Shift+click on a layer that's already selected
 *   removes it (like the Selection tool). The cursor shows the mode.
 * - Clicking empty canvas deselects in New mode (keeps the selection
 *   otherwise). Esc cancels a box being drawn, otherwise deselects.
 *
 * This tool only selects; switch to the Selection tool (V) to move or
 * resize what it selected. Hidden and locked layers are never picked.
 */
import type { FabricObject, Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { distance } from '../geometry';
import { isEffectivelyLocked } from '../meta';
import { combineLayers, resolveSelectionMode } from '../selectionModes';
import { crosshairCursor } from '../cursors';
import type { SelectionMode } from '../types';
import { ModeCursor } from './modeCursor';

const DRAG_THRESHOLD = 3;
/** Share of a layer's bounding box the drag box must cover to select it. */
export const OBJECT_BOX_COVERAGE = 0.5;

export class ObjectSelectionTool extends Tool {
  readonly id = 'objectSelection' as const;
  cursor = crosshairCursor('new');

  private start: Point | null = null;
  private startViewport: Point | null = null;
  private current: Point | null = null;
  private dragging = false;
  private mode: SelectionMode = 'new';
  private readonly modeCursor = new ModeCursor(
    this.editor,
    (mods) => crosshairCursor(this.modeFor(mods)),
    () => this.start !== null,
  );
  /** Selection when the button went down (Fabric clears it before our handler runs). */
  private before: FabricObject[] = [];
  private offBefore: (() => void) | null = null;

  activate() {
    // Show what's selected (outline only: this tool doesn't transform).
    this.editor.canvas.controlsMode = 'outline';
    this.offBefore = this.editor.canvas.on('mouse:down:before', () => {
      this.before = this.editor.canvas.getActiveObjects();
    });
    this.modeCursor.start();
    this.editor.canvas.requestRenderAll();
  }

  deactivate() {
    this.modeCursor.stop();
    this.offBefore?.();
    this.offBefore = null;
    this.start = this.current = null;
    this.dragging = false;
  }

  onPointerDown(ev: ToolPointerEvent) {
    this.start = ev.scenePoint;
    this.startViewport = ev.viewportPoint;
    this.current = ev.scenePoint;
    this.dragging = false;
    this.mode = this.modeFor(ev);
  }

  onOptionsChanged() {
    this.modeCursor.refresh();
  }

  /** The tool's mode, overridden by the keys held. */
  private modeFor(mods: { shift: boolean; alt: boolean }): SelectionMode {
    return resolveSelectionMode(this.editor.selectionModeOf(this.id), mods);
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.start || !this.startViewport) return;
    if (!this.dragging && distance(ev.viewportPoint, this.startViewport) < DRAG_THRESHOLD) return;
    this.dragging = true;
    this.current = ev.scenePoint;
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp(ev: ToolPointerEvent) {
    if (!this.start) return;
    const start = this.start;
    const end = this.current ?? start;
    const wasDrag = this.dragging;
    this.start = this.current = null;
    this.dragging = false;
    if (wasDrag) {
      const box = {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
      const hits = this.editor.canvas.getObjects().filter((o) => {
        if (!o.visible || isEffectivelyLocked(o)) return false;
        o.setCoords();
        return boxCoverage(o.getBoundingRect(), box) >= OBJECT_BOX_COVERAGE;
      });
      this.select(hits, this.mode);
    } else {
      const hit = this.editor.layerAt(ev.scenePoint);
      const current = this.before.filter((o) => !o.parent);
      // Shift+click on a selected layer takes it out (as with the Selection tool).
      const toggleOff = hit !== null && ev.shift && !ev.alt && current.includes(hit);
      this.select(hit ? [hit] : [], toggleOff ? 'subtract' : this.mode);
    }
    this.modeCursor.refresh();
    this.editor.canvas.requestRenderAll();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.start) {
      this.start = this.current = null;
      this.dragging = false;
      this.editor.selectObjects(this.before);
      this.editor.canvas.requestRenderAll();
      return true;
    }
    return false; // Esc with nothing in progress: the global Esc deselects.
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.dragging || !this.start || !this.current) return;
    const a = this.editor.sceneToViewport(this.start);
    const b = this.editor.sceneToViewport(this.current);
    ctx.save();
    ctx.fillStyle = 'rgba(77, 141, 255, 0.10)';
    ctx.strokeStyle = 'rgba(77, 141, 255, 0.9)';
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1;
    const x = Math.round(Math.min(a.x, b.x)) + 0.5;
    const y = Math.round(Math.min(a.y, b.y)) + 0.5;
    const w = Math.round(Math.abs(b.x - a.x));
    const h = Math.round(Math.abs(b.y - a.y));
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    // Preview which layers the box will take.
    ctx.setLineDash([]);
    const box = {
      left: Math.min(this.start.x, this.current.x),
      top: Math.min(this.start.y, this.current.y),
      width: Math.abs(this.current.x - this.start.x),
      height: Math.abs(this.current.y - this.start.y),
    };
    for (const o of this.editor.canvas.getObjects()) {
      if (!o.visible || isEffectivelyLocked(o)) continue;
      if (boxCoverage(o.getBoundingRect(), box) >= OBJECT_BOX_COVERAGE) this.editor.strokeObjectOutline(ctx, o, '#4d8dff', 1.5);
    }
    ctx.restore();
  }

  /** Applies a selection change to top-level layers. */
  private select(objs: FabricObject[], mode: SelectionMode) {
    const next = combineLayers(
      this.before.filter((o) => !o.parent),
      objs,
      mode,
    );
    // Keep stacking order (bottom to top) for a predictable multi-selection.
    const order = this.editor.canvas.getObjects();
    next.sort((p, q) => order.indexOf(p) - order.indexOf(q));
    if (next.length) this.editor.selectObjects(next);
    else this.editor.clearSelection();
  }
}

/** Fraction of `obj`'s bounding-box area covered by `box` (0..1). */
export function boxCoverage(
  obj: { left: number; top: number; width: number; height: number },
  box: { left: number; top: number; width: number; height: number },
): number {
  // Give hairline layers (e.g. a 0-width line) at least 1px of thickness.
  const w = Math.max(obj.width, 1);
  const h = Math.max(obj.height, 1);
  const left = obj.left + (obj.width - w) / 2;
  const top = obj.top + (obj.height - h) / 2;
  const ix = Math.max(0, Math.min(left + w, box.left + box.width) - Math.max(left, box.left));
  const iy = Math.max(0, Math.min(top + h, box.top + box.height) - Math.max(top, box.top));
  return (ix * iy) / (w * h);
}
