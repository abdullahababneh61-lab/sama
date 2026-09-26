/**
 * Text tool (T).
 *
 * - Click on empty canvas: create point text (grows as you type).
 * - Drag on empty canvas: create a paragraph text box that wraps at the
 *   dragged width.
 * - Click existing text: edit it at the clicked position.
 * - Esc (or clicking elsewhere) finishes editing. Empty text is discarded.
 *
 * Font family, size, weight, colour, alignment and direction come from the
 * options bar and can be changed afterwards in the properties panel.
 */
import { IText, Point, Textbox, type FabricObject } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { ensureFontLoaded } from '../fonts';
import { isEffectivelyLocked } from '../meta';

const DRAG_THRESHOLD = 6;

export class TextTool extends Tool {
  readonly id = 'text' as const;
  cursor = 'text';
  readonly targetFilter = (obj: FabricObject) => obj instanceof IText && !isEffectivelyLocked(obj);

  private start: Point | null = null;
  private current: Point | null = null;
  private wasEditing = false;
  private off: (() => void) | null = null;

  activate() {
    this.off = this.editor.canvas.on('mouse:down:before', () => {
      this.wasEditing = this.editor.state.isEditingText;
    });
  }

  deactivate() {
    this.off?.();
    this.off = null;
    this.start = this.current = null;
    this.editor.exitTextEditing();
  }

  onPointerDown(ev: ToolPointerEvent) {
    if (ev.target instanceof IText) return; // handled on pointer up
    // A click outside while editing just finishes the current text.
    if (this.wasEditing) return;
    this.start = ev.scenePoint;
    this.current = ev.scenePoint;
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.start) return;
    this.current = ev.scenePoint;
    this.editor.canvas.requestRenderAll();
  }

  async onPointerUp(ev: ToolPointerEvent) {
    const target = ev.target;
    if (target instanceof IText && !this.start) {
      if (!target.isEditing) {
        this.editor.selectObjects([target]);
        target.enterEditing(ev.e);
        target.setCursorByClick(ev.e);
        target.initDelayedCursor(true);
      }
      return;
    }
    if (!this.start || !this.current) return;
    const start = this.start;
    const end = this.current;
    this.start = this.current = null;
    this.editor.canvas.requestRenderAll();
    const dragged = Math.abs(end.x - start.x) > DRAG_THRESHOLD / this.editor.canvas.getZoom();
    await this.createText(start, dragged ? end : null);
  }

  private async createText(start: Point, end: Point | null) {
    const o = this.editor.toolOptions.text;
    await ensureFontLoaded(o.fontFamily, o.fontWeight, o.fontStyle);
    const rtl = o.direction === 'rtl';
    const common = {
      fontFamily: o.fontFamily,
      fontSize: o.fontSize,
      fontWeight: o.fontWeight,
      fontStyle: o.fontStyle,
      fill: o.fill,
      textAlign: o.textAlign,
      direction: o.direction,
      originY: 'top' as const,
      editingBorderColor: '#4d8dff',
      cursorColor: '#4d8dff',
      selectionColor: 'rgba(77, 141, 255, 0.3)',
      lineHeight: 1.2,
    };
    let text: IText;
    if (end) {
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      text = new Textbox('', {
        ...common,
        width: right - left,
        left: rtl ? right : left,
        top: Math.min(start.y, end.y),
        originX: rtl ? 'right' : 'left',
        splitByGrapheme: false,
      }) as unknown as IText;
    } else {
      text = new IText('', {
        ...common,
        left: start.x,
        top: start.y,
        originX: rtl ? 'right' : 'left',
      });
    }
    text.samaKind = 'text';
    this.editor.addLayer(text);
    text.enterEditing();
    this.editor.canvas.requestRenderAll();
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.start || !this.current) return;
    const a = this.editor.sceneToViewport(this.start);
    const b = this.editor.sceneToViewport(this.current);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#4d8dff';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.restore();
  }
}
