/**
 * Elliptical Marquee tool (Shift+M, pressed again from the Rectangular
 * Marquee): drag to select an elliptical area. Shift = circle (Shift at the
 * start = add to the selection), Alt = from the centre, click = deselect,
 * Esc = clear. See `MarqueeTool`.
 */
import { MarqueeTool } from './MarqueeTool';
import type { Box } from '../geometry';
import type { SelectionShape } from '../pixelSelection';

export class EllipseMarqueeTool extends MarqueeTool {
  readonly id = 'ellipseMarquee' as const;

  protected get historyLabel() {
    return 'Elliptical Marquee';
  }

  protected shapeFor(box: Box): SelectionShape {
    return { type: 'ellipse', cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx: box.w / 2, ry: box.h / 2 };
  }

  protected tracePreview(ctx: CanvasRenderingContext2D, box: Box) {
    const r = this.viewportBox(box);
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.abs(r.w / 2), Math.abs(r.h / 2), 0, 0, Math.PI * 2);
  }
}
