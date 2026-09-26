/**
 * Brush tool (B): freehand painting with adjustable size, colour, opacity and
 * hardness. Hold Shift while dragging to paint a straight line.
 *
 * Strokes are collected into the active paint layer (or a new one) — see
 * `PaintLayer` — and remain individual vector paths internally.
 */
import { Color, PencilBrush } from 'fabric';
import type { Canvas } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { BrushStroke, softness } from '../objects/BrushStroke';
import type { BrushOptions } from '../types';

/** PencilBrush that hands finished strokes to a callback instead of the canvas. */
class SamaPencilBrush extends PencilBrush {
  onStroke: (stroke: BrushStroke) => void = () => {};
  /** Stroke properties captured when the stroke started. */
  options: BrushOptions;
  /** Blur for the live preview, in viewport pixels. */
  previewBlur = 0;

  constructor(canvas: Canvas, options: BrushOptions) {
    super(canvas);
    this.options = options;
  }

  _setBrushStyles(ctx: CanvasRenderingContext2D) {
    super._setBrushStyles(ctx);
    ctx.filter = this.previewBlur > 0.01 ? `blur(${this.previewBlur.toFixed(2)}px)` : 'none';
  }

  needsFullRender() {
    // Soft or translucent strokes must be redrawn as a whole to look right.
    return this.previewBlur > 0.01 || super.needsFullRender();
  }

  _finalizeAndAddPath() {
    const ctx = this.canvas.contextTop;
    ctx.closePath();
    ctx.filter = 'none';
    if (this.decimate) this._points = this.decimatePoints(this._points, this.decimate);
    const pathData = this.convertPointsToSVGPath(this._points);
    this.canvas.clearContext(ctx);
    this.canvas.requestRenderAll();
    if (!pathData.length) return;
    const { size, color, opacity, hardness } = this.options;
    const stroke = new BrushStroke(pathData, {
      fill: null,
      stroke: color,
      strokeWidth: softness(size, hardness).coreWidth,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      opacity,
      samaHardness: hardness,
      samaBrushSize: size,
    } as Partial<BrushStroke>);
    this.onStroke(stroke);
  }
}

export class BrushTool extends Tool {
  readonly id = 'brush' as const;
  cursor = 'crosshair';
  private brush: SamaPencilBrush | null = null;

  activate() {
    const c = this.editor.canvas;
    this.brush = new SamaPencilBrush(c, this.editor.toolOptions.brush);
    this.brush.onStroke = (stroke) => this.editor.addBrushStroke(stroke);
    this.configure();
    c.freeDrawingBrush = this.brush;
    c.isDrawingMode = true;
  }

  deactivate() {
    const c = this.editor.canvas;
    c.isDrawingMode = false;
    c.contextTop.filter = 'none';
    this.brush = null;
    this.editor.hideBrushCursor();
  }

  onOptionsChanged() {
    this.configure();
  }

  private configure() {
    if (!this.brush) return;
    const o = this.editor.toolOptions.brush;
    const { coreWidth, blur } = softness(o.size, o.hardness);
    const b = this.brush;
    b.options = { ...o };
    b.width = coreWidth;
    b.color = new Color(o.color).setAlpha(o.opacity).toRgba();
    b.previewBlur = blur * this.editor.canvas.getZoom();
    b.decimate = Math.max(0.4, o.smoothing);
    b.strokeLineCap = 'round';
    b.strokeLineJoin = 'round';
    b.straightLineKey = 'shiftKey';
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.editor.showBrushCursor(ev.viewportPoint, this.editor.toolOptions.brush.size);
  }
}
