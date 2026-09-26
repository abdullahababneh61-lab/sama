/**
 * Fabric canvas subclass with the hooks the workspace needs:
 *
 * - `renderBackdrop`: paints the grey pasteboard and the artboard (instead of
 *   Fabric's flat background colour).
 * - `renderOverlay`: draws guides, snap lines, hover outlines and tool visuals
 *   above the artwork but *below* selection handles.
 * - `targetFilter`: restricts which objects can be clicked (e.g. the text tool
 *   only targets text).
 * - `controlsMode`: whether selection handles, only the outline, or nothing is
 *   drawn for the active object (painting tools hide them).
 */
import { Canvas } from 'fabric';
import type { FabricObject, Point, TPointerEvent } from 'fabric';

export type ControlsMode = 'full' | 'outline' | 'none';

export class SamaCanvas extends Canvas {
  renderBackdrop?: (ctx: CanvasRenderingContext2D) => void;
  renderOverlay?: (ctx: CanvasRenderingContext2D, isMainContext: boolean) => void;
  targetFilter: ((obj: FabricObject) => boolean) | null = null;
  controlsMode: ControlsMode = 'full';

  _renderBackground(ctx: CanvasRenderingContext2D) {
    if (this.renderBackdrop) this.renderBackdrop(ctx);
    else super._renderBackground(ctx);
  }

  _renderOverlay(ctx: CanvasRenderingContext2D) {
    super._renderOverlay(ctx);
    this.renderOverlay?.(ctx, ctx === this.contextContainer);
  }

  drawControls(ctx: CanvasRenderingContext2D) {
    const active = this.getActiveObject();
    if (!active || this.controlsMode === 'none') return;
    if (this.controlsMode === 'outline') {
      active._renderControls(ctx, { hasControls: false });
      return;
    }
    super.drawControls(ctx);
  }

  /**
   * Fabric normally drops the selection when a free-drawing stroke starts.
   * We keep it: the brush paints into the selected paint layer, and the
   * eraser only affects selected layers (when there is a selection).
   */
  _onMouseDownInDrawingMode(e: TPointerEvent) {
    const self = this as unknown as {
      _isCurrentlyDrawing: boolean;
      _handleEvent: (e: TPointerEvent, type: string, extra: object) => void;
    };
    self._isCurrentlyDrawing = true;
    const pointer = this.getScenePoint(e);
    this.freeDrawingBrush?.onMouseDown(pointer, { e, pointer });
    self._handleEvent(e, 'down', { alreadySelected: false });
  }

  _checkTarget(obj: FabricObject, pointer: Point): boolean {
    if (this.targetFilter && !this.targetFilter(obj)) return false;
    return super._checkTarget(obj, pointer);
  }
}
