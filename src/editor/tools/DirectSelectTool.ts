/**
 * Direct Selection tool (A): edit the anchor points and Bézier handles of
 * vector paths (pen paths, lines) and polygons.
 *
 * Click a path to show its anchors (filled squares) and handles (hollow
 * squares joined to their anchor by a dashed line), then drag them.
 * Double-click an anchor to switch it between a corner and a smooth point. Paths
 * inside groups can be clicked directly. Rectangles and ellipses must first be
 * converted with Object ▸ Convert to Path.
 */
import { Group, type FabricObject } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { PaintLayer } from '../objects/PaintLayer';
import { isAnchorEditable, isEffectivelyLocked } from '../meta';
import { deepHit } from './SelectTool';

export class DirectSelectTool extends Tool {
  readonly id = 'direct' as const;
  cursor = 'default';
  readonly selectsObjects = true;
  readonly showsControls = true;
  readonly marquee = false;

  private off: (() => void)[] = [];

  activate() {
    const c = this.editor.canvas;
    const sync = () => this.syncEditing();
    this.off = [c.on('selection:created', sync), c.on('selection:updated', sync)];
    this.syncEditing();
  }

  deactivate() {
    this.off.forEach((f) => f());
    this.off = [];
    this.editor.stopPathEditing();
  }

  private syncEditing() {
    const objs = this.editor.canvas.getActiveObjects();
    if (objs.length === 1 && isAnchorEditable(objs[0])) this.editor.startPathEditing(objs[0]);
    else this.editor.stopPathEditing();
  }

  onPointerDown(ev: ToolPointerEvent) {
    const target = ev.target;
    if (target instanceof Group && !(target instanceof PaintLayer) && target.type !== 'activeselection') {
      const child = deepHit(target, ev.scenePoint);
      if (child && isAnchorEditable(child)) {
        this.editor.selectObjects([child]);
        this.editor.startPathEditing(child);
        return;
      }
    }
    if (target && !isAnchorEditable(target) && !(target instanceof Group)) {
      this.editor.notify('toast.convertToPathHint');
    }
  }

  onDoubleClick(ev: ToolPointerEvent) {
    this.editor.toggleAnchorAt(ev.viewportPoint);
  }

  static canEdit(obj: FabricObject) {
    return isAnchorEditable(obj) && !isEffectivelyLocked(obj);
  }
}
