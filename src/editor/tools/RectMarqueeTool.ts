/**
 * Rectangular Marquee tool (Shift+M): drag to select a rectangular area of
 * the artboard. Shift = square (Shift at the start = add to the selection),
 * Alt = from the centre, click = deselect, Esc = clear. See `MarqueeTool`.
 */
import { MarqueeTool } from './MarqueeTool';
import type { Box } from '../geometry';
import type { SelectionShape } from '../pixelSelection';

export class RectMarqueeTool extends MarqueeTool {
  readonly id = 'rectMarquee' as const;

  protected get historyLabel() {
    return 'Rectangular Marquee';
  }

  protected shapeFor(box: Box): SelectionShape {
    return { type: 'rect', x: box.x, y: box.y, w: box.w, h: box.h };
  }

  protected tracePreview(ctx: CanvasRenderingContext2D, box: Box) {
    const r = this.viewportBox(box);
    ctx.rect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
  }
}
