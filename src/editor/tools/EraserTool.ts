/**
 * Eraser tool (E).
 *
 * Follows Illustrator's rule: if layers are selected, only those are erased;
 * otherwise every visible, unlocked layer under the stroke is erased.
 *
 * Erasing is non-destructive: it adds an eraser path to the layer's clip
 * (via @erase2d/fabric), so images and shapes stay intact underneath and the
 * operation can be undone. Text layers are not erased (they would stop being
 * editable text) — the same restriction Photoshop has for type layers.
 */
import { EraserBrush } from '@erase2d/fabric';
import { Group, IText, type FabricObject } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { isEffectivelyLocked, walkLayers } from '../meta';
import { PaintLayer } from '../objects/PaintLayer';

type ErasingEndEvent = CustomEvent<{ path: FabricObject; targets: FabricObject[] }>;

export class EraserTool extends Tool {
  readonly id = 'eraser' as const;
  cursor = 'crosshair';
  private brush: EraserBrush | null = null;
  private disposers: (() => void)[] = [];
  private brushSize = { w: 0, h: 0 };
  private erasing = false;

  activate() {
    this.createBrush();
  }

  deactivate() {
    this.destroyBrush();
    this.editor.canvas.isDrawingMode = false;
    this.editor.hideBrushCursor();
  }

  /** The brush caches a canvas-sized buffer, so it is rebuilt on resize. */
  private createBrush() {
    this.destroyBrush();
    const c = this.editor.canvas;
    const brush = new EraserBrush(c);
    this.brushSize = { w: c.width, h: c.height };
    brush.width = this.editor.toolOptions.eraser.size;
    this.disposers.push(
      brush.on('start', () => {
        this.erasing = true;
        this.prepareTargets();
      }),
      brush.on('end', (e: Event) => {
        const ev = e as ErasingEndEvent;
        ev.preventDefault();
        void this.commit(brush, ev.detail.path, ev.detail.targets);
      }),
      brush.on('cancel', () => {
        this.erasing = false;
      }),
    );
    this.brush = brush;
    c.freeDrawingBrush = brush;
    c.isDrawingMode = true;
  }

  private destroyBrush() {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.brush?.dispose?.();
    this.brush = null;
  }

  private async commit(brush: EraserBrush, path: FabricObject, targets: FabricObject[]) {
    this.erasing = false;
    if (!targets.length) return;
    await brush.commit({ path: path as Parameters<EraserBrush['commit']>[0]['path'], targets });
    targets.forEach((t) => t.set('dirty', true));
    this.editor.canvas.requestRenderAll();
    this.editor.commit('Erase');
  }

  /** Marks which layers the eraser may affect for this stroke. */
  private prepareTargets() {
    const c = this.editor.canvas;
    walkLayers(c.getObjects(), (o) => {
      o.erasable = false;
    });
    const selected = c.getActiveObjects();
    const base = selected.length ? selected : c.getObjects();
    const mark = (obj: FabricObject) => {
      if (!obj.visible || isEffectivelyLocked(obj) || obj instanceof IText) return;
      if (obj instanceof PaintLayer) {
        obj.erasable = 'deep';
        obj.getObjects().forEach((s) => (s.erasable = true));
      } else if (obj instanceof Group) {
        obj.erasable = 'deep';
        obj.getObjects().forEach(mark);
      } else {
        obj.erasable = true;
      }
    };
    base.forEach(mark);
  }

  onOptionsChanged() {
    const c = this.editor.canvas;
    if (!this.brush) return;
    if (!this.erasing && (c.width !== this.brushSize.w || c.height !== this.brushSize.h)) this.createBrush();
    if (this.brush) this.brush.width = this.editor.toolOptions.eraser.size;
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.editor.showBrushCursor(ev.viewportPoint, this.editor.toolOptions.eraser.size);
  }
}
