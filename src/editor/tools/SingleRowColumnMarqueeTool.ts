/**
 * Single Row/Column Marquee tool: click to select one pixel row spanning
 * the artboard's width, or one pixel column spanning its height.
 *
 * - Row or Column is chosen in the options bar (the marquee shape switch).
 * - Hold the button and move to position the line; it's selected on release.
 * - Shift+click adds to the selection (several rows/columns); Esc clears.
 * - Clicks outside the artboard's rows (or columns) do nothing.
 *
 * Like Photoshop, this tool has no keyboard shortcut of its own: pick it in
 * the toolbar or from the marquee options.
 */
import { RegionTool } from './RegionTool';
import type { ToolPointerEvent } from './Tool';
import type { CombineMode } from '../pixelSelection';

export class SingleRowColumnMarqueeTool extends RegionTool {
  readonly id = 'singleRowColumnMarquee' as const;

  /** Row (y) or column (x) index being placed, or null. */
  private index: number | null = null;
  private mode: CombineMode = 'replace';

  private get orientation() {
    return this.editor.toolOptions.singleRowColumnMarquee.orientation;
  }

  protected get busy() {
    return this.index !== null;
  }

  protected cancel() {
    this.index = null;
  }

  onPointerDown(ev: ToolPointerEvent) {
    const index = this.indexAt(ev);
    if (index === null) return;
    this.index = index;
    this.mode = this.modeFor(ev);
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (this.index === null) return;
    const index = this.indexAt(ev, true);
    if (index !== null && index !== this.index) {
      this.index = index;
      this.editor.canvas.requestRenderAll();
    }
  }

  onPointerUp() {
    if (this.index === null) return;
    const i = this.index;
    this.index = null;
    const { width, height } = this.editor.doc;
    this.editor.selectRegion(
      this.orientation === 'row' ? { type: 'rect', x: 0, y: i, w: width, h: 1 } : { type: 'rect', x: i, y: 0, w: 1, h: height },
      this.mode,
    );
    this.editor.canvas.requestRenderAll();
  }

  onOptionsChanged() {
    this.editor.canvas.requestRenderAll();
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (this.index === null) return;
    const { width, height } = this.editor.doc;
    const i = this.index;
    const [a, b] =
      this.orientation === 'row'
        ? [this.editor.sceneToViewport({ x: 0, y: i }), this.editor.sceneToViewport({ x: width, y: i + 1 })]
        : [this.editor.sceneToViewport({ x: i, y: 0 }), this.editor.sceneToViewport({ x: i + 1, y: height })];
    this.strokePreview(ctx, (c) =>
      c.rect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.max(1, Math.round(b.x - a.x)), Math.max(1, Math.round(b.y - a.y))),
    );
  }

  /** Pixel row/column under the pointer; null outside the artboard (unless clamping). */
  private indexAt(ev: ToolPointerEvent, clamp = false): number | null {
    const { width, height } = this.editor.doc;
    const row = this.orientation === 'row';
    const v = Math.floor(row ? ev.scenePoint.y : ev.scenePoint.x);
    const max = (row ? height : width) - 1;
    if (v < 0 || v > max) return clamp ? Math.min(max, Math.max(0, v)) : null;
    return v;
  }
}
