/** Hand tool (H, or hold Space): drag to pan the view. */
import { Tool, type ToolPointerEvent } from './Tool';

export class HandTool extends Tool {
  readonly id = 'hand' as const;
  cursor = 'grab';
  private last: { x: number; y: number } | null = null;

  onPointerDown(ev: ToolPointerEvent) {
    this.last = { x: ev.viewportPoint.x, y: ev.viewportPoint.y };
    this.editor.setCursor('grabbing');
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.last) return;
    const dx = ev.viewportPoint.x - this.last.x;
    const dy = ev.viewportPoint.y - this.last.y;
    this.last = { x: ev.viewportPoint.x, y: ev.viewportPoint.y };
    this.editor.panBy(dx, dy);
  }

  onPointerUp() {
    this.last = null;
    this.editor.setCursor('grab');
  }

  deactivate() {
    this.last = null;
  }
}
