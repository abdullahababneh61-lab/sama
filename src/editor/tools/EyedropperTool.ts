/**
 * Eyedropper tool (I): picks a colour from the artwork.
 *
 * - Move over the canvas: a round swatch next to the pointer previews the
 *   colour under it (shapes, images, text, paint — anything visible).
 * - Click: that colour becomes the fill colour used by the shape tools, the
 *   pen, the text tool and the brush.
 * - Alt/Option+click: it becomes the stroke colour of the shape tools and
 *   the pen instead.
 * - After a pick, or on Esc, the tool that was active before comes back.
 *
 * Colours are sampled from a clean render of the scene (artboard background
 * plus layers), not from the screen, so guides, selection outlines and this
 * tool's own swatch are never picked up. Outside the artboard only layers
 * count; empty or fully transparent spots pick nothing.
 */
import type { FabricObject, Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';

/** Eyedropper cursor (hotspot at the pipette's tip, bottom-left). */
const PIPETTE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cg stroke='%23000' stroke-width='3.5'%3E%3Cpath d='m2 22 1-1h3l9-9'/%3E%3Cpath d='M3 21v-3l9-9'/%3E%3Cpath d='m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z'/%3E%3C/g%3E%3Cg stroke='%23fff' stroke-width='1.6'%3E%3Cpath d='m2 22 1-1h3l9-9'/%3E%3Cpath d='M3 21v-3l9-9'/%3E%3Cpath d='m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z'/%3E%3C/g%3E%3C/svg%3E\") 2 22, crosshair";

/** Where the preview swatch sits relative to the pointer (screen px). */
const SWATCH_OFFSET = { x: 22, y: -22 };
const SWATCH_RADIUS = 13;

export class EyedropperTool extends Tool {
  readonly id = 'eyedropper' as const;
  cursor = PIPETTE_CURSOR;

  /** Pointer position in viewport coordinates, or null when off the canvas. */
  private pointer: Point | null = null;
  /** Colour currently under the pointer (#rrggbb), or null if nothing there. */
  private hoverColor: string | null = null;
  private frame = 0;
  private offOut: (() => void) | null = null;

  activate() {
    this.offOut = this.editor.canvas.on('mouse:out', () => {
      this.pointer = null;
      this.hoverColor = null;
      this.editor.canvas.requestRenderAll();
    });
  }

  deactivate() {
    this.offOut?.();
    this.offOut = null;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pointer = null;
    this.hoverColor = null;
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.pointer = ev.viewportPoint;
    // Sample at most once per frame.
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.pointer) return;
      this.hoverColor = sampleSceneColor(this.editor, this.pointer);
      this.editor.canvas.requestRenderAll();
    });
  }

  onPointerDown(ev: ToolPointerEvent) {
    const color = sampleSceneColor(this.editor, ev.viewportPoint);
    if (!color) {
      this.editor.notify('toast.eyedropperNothing');
      return;
    }
    if (ev.alt) {
      this.editor.updateToolOptions('shape', { stroke: color });
      this.editor.updateToolOptions('pen', { stroke: color });
    } else {
      this.editor.updateToolOptions('shape', { fill: color });
      this.editor.updateToolOptions('pen', { fill: color });
      this.editor.updateToolOptions('text', { fill: color });
      this.editor.updateToolOptions('brush', { color });
    }
    this.returnToPreviousTool();
  }

  onPointerUp() {}

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.returnToPreviousTool();
      return true;
    }
    return false;
  }

  private returnToPreviousTool() {
    const previous = this.editor.previousTool;
    this.editor.setTool(previous && previous !== this.id ? previous : 'select');
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.pointer || !this.hoverColor) return;
    const cx = this.pointer.x + SWATCH_OFFSET.x;
    const cy = this.pointer.y + SWATCH_OFFSET.y;
    ctx.save();
    // Swatch with a white ring and a dark outline so it reads on any colour.
    ctx.beginPath();
    ctx.arc(cx, cy, SWATCH_RADIUS + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(cx, cy, SWATCH_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = this.hoverColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Hex value beside the swatch.
    const label = this.hoverColor.toUpperCase();
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    const tw = ctx.measureText(label).width;
    const lx = cx + SWATCH_RADIUS + 8;
    const ly = cy - 9;
    ctx.fillStyle = 'rgba(12, 12, 15, 0.85)';
    ctx.fillRect(lx, ly, tw + 10, 18);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + 5, ly + 9);
    ctx.restore();
  }
}

/**
 * Colour of the artwork at a viewport point: renders just that pixel of the
 * scene (artboard background and layers, with their opacity, blend modes and
 * masks) into a 1×1 canvas. Returns #rrggbb, or null where nothing is visible.
 */
export function sampleSceneColor(
  editor: { canvas: { viewportTransform: number[]; getObjects(): FabricObject[] }; doc: { width: number; height: number; background: string | null } },
  viewportPoint: { x: number; y: number },
): string | null {
  const el = document.createElement('canvas');
  el.width = el.height = 1;
  const ctx = el.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const v = editor.canvas.viewportTransform;
  const { width, height, background } = editor.doc;
  // Shift the scene so the sampled point lands on the canvas's only pixel.
  ctx.translate(-Math.floor(viewportPoint.x), -Math.floor(viewportPoint.y));
  ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  for (const obj of editor.canvas.getObjects()) {
    if (obj.visible) obj.render(ctx);
  }
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a === 0) return null;
  // Canvas pixels are un-premultiplied: this is the colour as painted.
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
