/**
 * Selection tool (V): click to select, drag to move, handles to resize and
 * rotate, marquee to select several layers.
 *
 * Extras on top of Fabric's built-in behaviour:
 * - Ctrl/Cmd+click selects the deepest layer inside a group ("deep select").
 * - Double-click a group to select the layer under the pointer inside it.
 * - Double-click a path/polygon to edit its anchor points.
 * - Alt+drag leaves a copy behind (duplicate while moving).
 */
import { Group, type FabricObject, type Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { PaintLayer } from '../objects/PaintLayer';
import { isAnchorEditable, isEffectivelyLocked } from '../meta';

/** Innermost selectable layer under `point` inside `group`. */
export function deepHit(group: Group, point: Point, onlyOneLevel = false): FabricObject | null {
  const children = group.getObjects();
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (!child.visible || isEffectivelyLocked(child)) continue;
    // Children of non-interactive groups don't keep their coords up to date.
    child.setCoords();
    if (!child.containsPoint(point)) continue;
    if (!onlyOneLevel && child instanceof Group && !(child instanceof PaintLayer)) {
      return deepHit(child, point) ?? child;
    }
    return child;
  }
  return null;
}

export class SelectTool extends Tool {
  readonly id = 'select' as const;
  cursor = 'default';
  readonly selectsObjects = true;
  readonly showsControls = true;

  private altCopyDone = false;
  private offMoving: (() => void) | null = null;
  private offDown: (() => void) | null = null;

  activate() {
    const c = this.editor.canvas;
    this.offMoving = c.on('object:moving', (e) => {
      const ev = e.e as MouseEvent;
      if (ev?.altKey && !this.altCopyDone) {
        this.altCopyDone = true;
        const objs = c.getActiveObjects().filter((o) => !isEffectivelyLocked(o));
        if (objs.length) void this.editor.leaveCopyBehind(objs);
      }
    });
    this.offDown = c.on('mouse:down:before', () => {
      this.altCopyDone = false;
    });
  }

  deactivate() {
    this.offMoving?.();
    this.offDown?.();
    this.offMoving = this.offDown = null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    // Deep select: Ctrl/Cmd+click goes straight to the layer inside groups.
    if (ev.mod && ev.target instanceof Group && !(ev.target instanceof PaintLayer)) {
      const child = deepHit(ev.target, ev.scenePoint);
      if (child) this.editor.selectObjects([child]);
    }
  }

  onDoubleClick(ev: ToolPointerEvent) {
    const target = ev.target;
    if (!target) return;
    const active = this.editor.canvas.getActiveObject();
    // Enter a group: select the child under the pointer, one level deeper.
    const container = active instanceof Group && !(active instanceof PaintLayer) && active.type !== 'activeselection' ? active : target;
    if (container instanceof Group && !(container instanceof PaintLayer) && container.type !== 'activeselection') {
      const child = deepHit(container, ev.scenePoint, true);
      if (child) {
        this.editor.selectObjects([child]);
        return;
      }
    }
    if (isAnchorEditable(target) && !isEffectivelyLocked(target)) {
      this.editor.setTool('direct');
      this.editor.selectObjects([target]);
      this.editor.startPathEditing(target);
    }
  }
}
