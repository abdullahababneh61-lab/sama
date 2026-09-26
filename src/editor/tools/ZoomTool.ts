/** Zoom tool (Z): click to zoom in, Alt+click to zoom out. */
import { Tool, type ToolPointerEvent } from './Tool';

export class ZoomTool extends Tool {
  readonly id = 'zoom' as const;
  cursor = 'zoom-in';
  private altHeld = false;

  onPointerDown(ev: ToolPointerEvent) {
    this.editor.zoomStep(ev.alt ? -1 : 1, ev.viewportPoint);
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (ev.alt !== this.altHeld) {
      this.altHeld = ev.alt;
      this.editor.setCursor(ev.alt ? 'zoom-out' : 'zoom-in');
    }
  }
}
