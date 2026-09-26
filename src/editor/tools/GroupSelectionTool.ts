/**
 * Group Selection tool (Shift+V), like Illustrator's: select a layer inside
 * a group, then climb up the group hierarchy with further clicks.
 *
 * - First click: selects the innermost layer under the pointer, even deep
 *   inside nested groups (a layer that isn't in a group is simply selected).
 * - Click again on the selection: selects the group containing it; each
 *   further click goes one level up, until the top-level group.
 * - Drag: moves the selected layer (or group) — handy for adjusting one
 *   item inside a group without ungrouping it.
 * - Esc: deselect. Click empty canvas: deselect.
 *
 * Paint layers count as single layers (their individual brush strokes are
 * not selected). Hidden and locked layers are skipped.
 */
import { Group, type FabricObject, type Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { deepHit } from './SelectTool';
import { PaintLayer } from '../objects/PaintLayer';
import { distance } from '../geometry';
import { isEffectivelyLocked } from '../meta';

const DRAG_THRESHOLD = 3;

export class GroupSelectionTool extends Tool {
  readonly id = 'groupSelection' as const;
  cursor = 'default';

  private down: { viewport: Point; last: Point; expand: boolean } | null = null;
  private dragging = false;
  private hover: FabricObject | null = null;
  /** Selection when the button went down (Fabric clears it before our handler runs). */
  private before: FabricObject[] = [];
  private offBefore: (() => void) | null = null;

  activate() {
    this.editor.canvas.controlsMode = 'outline';
    this.offBefore = this.editor.canvas.on('mouse:down:before', () => {
      this.before = this.editor.canvas.getActiveObjects();
    });
    this.editor.canvas.requestRenderAll();
  }

  deactivate() {
    this.offBefore?.();
    this.offBefore = null;
    if (this.dragging) this.finishDrag();
    this.down = null;
    this.hover = null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    const leaf = this.leafAt(ev.scenePoint);
    if (!leaf) {
      this.down = null;
      this.editor.clearSelection();
      return;
    }
    const selected = this.before.length === 1 ? this.before[0] : null;
    // A click inside the current selection climbs one level (on release, if it wasn't a drag).
    const expand = !!selected && isAncestorOrSelf(selected, leaf);
    this.editor.selectObjects([expand && selected ? selected : leaf]);
    this.down = { viewport: ev.viewportPoint, last: ev.scenePoint, expand };
    this.dragging = false;
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.down) {
      const hit = this.leafAt(ev.scenePoint);
      if (hit !== this.hover) {
        this.hover = hit;
        this.editor.canvas.requestRenderAll();
      }
      return;
    }
    if (!this.dragging && distance(ev.viewportPoint, this.down.viewport) < DRAG_THRESHOLD) return;
    const target = this.singleSelection();
    if (!target || isEffectivelyLocked(target)) return;
    this.dragging = true;
    this.hover = null;
    this.editor.translateInScene(target, ev.scenePoint.x - this.down.last.x, ev.scenePoint.y - this.down.last.y);
    this.down.last = ev.scenePoint;
    for (let p = target.parent as Group | undefined; p; p = p.parent as Group | undefined) p.set('dirty', true);
    this.editor.scheduleSelectionSync();
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp() {
    const down = this.down;
    this.down = null;
    if (!down) return;
    if (this.dragging) {
      this.finishDrag();
      return;
    }
    if (down.expand) {
      const selected = this.singleSelection();
      const parent = selected?.parent;
      if (parent instanceof Group && !(parent instanceof PaintLayer)) this.editor.selectObjects([parent]);
    }
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    const active = this.editor.canvas.getActiveObjects();
    if (this.hover && !active.includes(this.hover)) this.editor.strokeObjectOutline(ctx, this.hover, '#4d8dff', 1.5);
  }

  // ---------------------------------------------------------------------------

  /** Innermost selectable layer under a scene point. */
  private leafAt(point: Point): FabricObject | null {
    const top = this.editor.layerAt(point);
    if (top instanceof Group && !(top instanceof PaintLayer)) return deepHit(top, point) ?? top;
    return top;
  }

  /** The selected layer, when exactly one is selected. */
  private singleSelection(): FabricObject | null {
    const active = this.editor.canvas.getActiveObject();
    return active && active.type !== 'activeselection' ? active : null;
  }

  private finishDrag() {
    this.dragging = false;
    const target = this.singleSelection();
    // Groups grow/shrink to fit their moved child.
    for (let p = target?.parent as Group | undefined; p; p = p.parent as Group | undefined) p.triggerLayout();
    target?.setCoords();
    this.editor.commit('Move');
    this.editor.canvas.requestRenderAll();
  }
}

function isAncestorOrSelf(ancestor: FabricObject, obj: FabricObject): boolean {
  for (let p: FabricObject | undefined = obj; p; p = p.parent as FabricObject | undefined) {
    if (p === ancestor) return true;
  }
  return false;
}
