/**
 * Grid tool (Alt+Shift+\): one toolbar tool with two modes, picked in the
 * options bar.
 *
 * Rectangular grid — drag a rectangle (Shift: square, Alt: from the centre,
 * like the Rectangle tool); it is filled with evenly spaced rows and
 * columns (default 4 × 4) inside an outer frame.
 *
 * Polar grid — press at the centre and drag outwards: a circle whose radius
 * is the drag distance, with evenly spaced concentric rings (default 4, the
 * outer edge included) and dividers from the centre (default 8).
 *
 * The grid is one group of lines — select, move, resize and rotate it as a
 * unit with the Selection tool (V); the lines keep their width when it is
 * resized. Rows/columns (or rings/dividers) set in the options bar apply to
 * the next grid and also rebuild a selected grid after it was drawn.
 * Also see GeneratedShapeTool: click for a default size, Esc cancels a drag.
 */
import type { FabricObject } from 'fabric';
import { GeneratedShapeTool, type DragState } from './GeneratedShapeTool';
import { dragBox } from '../geometry';
import { polarGridLayout, rectGridLines } from '../pathShapes';
import { createPolarGrid, createRectGrid } from '../generatedShapes';
import type { ShapeParams } from '../types';

const DEFAULT_SIZE = 100;
/** Limits for the counts (a sanity cap, not a design rule). */
export const GRID_MAX = 100;

const clampCount = (n: number, min: number) => Math.max(min, Math.min(GRID_MAX, Math.round(n) || min));

export class GridTool extends GeneratedShapeTool {
  readonly id = 'grid' as const;

  private get options() {
    const o = this.editor.toolOptions.grid;
    return {
      ...o,
      rows: clampCount(o.rows, 1),
      columns: clampCount(o.columns, 1),
      rings: clampCount(o.rings, 1),
      dividers: clampCount(o.dividers, 0),
    };
  }

  protected get style() {
    return { stroke: this.options.stroke, strokeWidth: this.options.strokeWidth };
  }

  protected get settingsLabel() {
    return 'Grid settings';
  }

  private box(drag: DragState) {
    if (!drag.end) return { x: drag.start.x - DEFAULT_SIZE / 2, y: drag.start.y - DEFAULT_SIZE / 2, w: DEFAULT_SIZE, h: DEFAULT_SIZE };
    return dragBox(drag.start, drag.end, drag.shift, drag.alt);
  }

  private radius(drag: DragState) {
    return drag.end ? Math.hypot(drag.end.x - drag.start.x, drag.end.y - drag.start.y) : DEFAULT_SIZE / 2;
  }

  protected previewPath(drag: DragState): string {
    const o = this.options;
    const parts: string[] = [];
    const line = (ax: number, ay: number, bx: number, by: number) => parts.push(`M ${ax} ${ay} L ${bx} ${by}`);
    if (o.mode === 'rect') {
      const b = this.box(drag);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      parts.push(`M ${b.x} ${b.y} h ${b.w} v ${b.h} h ${-b.w} Z`);
      const { horizontal, vertical } = rectGridLines(b.w, b.h, o.rows, o.columns);
      for (const s of [...horizontal, ...vertical]) line(cx + s.a.x, cy + s.a.y, cx + s.b.x, cy + s.b.y);
    } else {
      const c = drag.start;
      const layout = polarGridLayout(this.radius(drag), o.rings, o.dividers);
      for (const r of layout.radii) parts.push(`M ${c.x + r} ${c.y} A ${r} ${r} 0 1 0 ${c.x - r} ${c.y} A ${r} ${r} 0 1 0 ${c.x + r} ${c.y}`);
      for (const s of layout.dividers) line(c.x + s.a.x, c.y + s.a.y, c.x + s.b.x, c.y + s.b.y);
    }
    return parts.join(' ');
  }

  protected create(drag: DragState): FabricObject | null {
    const o = this.options;
    if (o.mode === 'rect') {
      const b = this.box(drag);
      if (b.w < 2 || b.h < 2) return null;
      return createRectGrid({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, b.w, b.h, o.rows, o.columns, this.style);
    }
    const r = this.radius(drag);
    if (r < 1) return null;
    return createPolarGrid(drag.start, r, o.rings, o.dividers, this.style);
  }

  protected historyLabel(obj: FabricObject) {
    return obj.samaParams?.type === 'polarGrid' ? 'Polar grid' : 'Grid';
  }

  protected settings() {
    const { rows, columns, rings, dividers } = this.options;
    return { rows, columns, rings, dividers };
  }

  protected applySettings(current: ShapeParams, changed: Record<string, number>): ShapeParams | null {
    if (current.type === 'rectGrid' && (changed.rows !== undefined || changed.columns !== undefined)) {
      return { ...current, rows: changed.rows ?? current.rows, columns: changed.columns ?? current.columns };
    }
    if (current.type === 'polarGrid' && (changed.rings !== undefined || changed.dividers !== undefined)) {
      return { ...current, rings: changed.rings ?? current.rings, dividers: changed.dividers ?? current.dividers };
    }
    return null;
  }
}
