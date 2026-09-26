/**
 * Shape tools: Rectangle (M), Ellipse (L), Line (\) and Polygon (cycle with U).
 *
 * - Drag to draw. Shift constrains to a square/circle (or 45° for lines),
 *   Alt draws from the centre.
 * - A single click creates a 100 × 100 px shape at that point.
 *
 * Shapes keep their stroke width constant when resized (`strokeUniform`).
 */
import { Ellipse, Path, Point, Polygon, Rect, type FabricObject } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { constrainTo45 } from '../geometry';
import { regularPolygonPoints } from '../geometry';
import type { ShapeToolId } from '../types';

const DEFAULT_SIZE = 100;

export class ShapeTool extends Tool {
  cursor = 'crosshair';
  private start: Point | null = null;
  private shape: FabricObject | null = null;
  private moved = false;

  constructor(
    editor: ConstructorParameters<typeof Tool>[0],
    readonly id: ShapeToolId,
  ) {
    super(editor);
  }

  deactivate() {
    if (this.shape) this.finish();
  }

  private create(): FabricObject {
    const o = this.editor.toolOptions.shape;
    const paint = {
      fill: o.fill ?? '',
      stroke: o.stroke ?? '',
      strokeWidth: o.stroke ? o.strokeWidth : 0,
      strokeUniform: true,
      strokeLineJoin: 'miter' as const,
    };
    switch (this.id) {
      case 'rect':
        return new Rect({ ...paint, width: 1, height: 1, rx: o.cornerRadius, ry: o.cornerRadius, samaKind: 'rect' } as Partial<Rect>);
      case 'ellipse':
        return new Ellipse({ ...paint, rx: 0.5, ry: 0.5, samaKind: 'ellipse' } as Partial<Ellipse>);
      case 'polygon': {
        const poly = new Polygon(regularPolygonPoints(o.sides, 0.5, 0.5), { ...paint, samaKind: 'polygon' } as Partial<Polygon>);
        poly.samaSides = Math.max(3, Math.round(o.sides));
        return poly;
      }
      case 'line':
        return new Path('M 0 0 L 1 0', {
          fill: '',
          stroke: o.stroke ?? '#1f1f24',
          strokeWidth: Math.max(1, o.strokeWidth),
          strokeUniform: true,
          strokeLineCap: 'round',
          samaKind: 'line',
        } as Partial<Path>);
    }
  }

  onPointerDown(ev: ToolPointerEvent) {
    this.start = ev.scenePoint;
    this.moved = false;
    this.shape = this.create();
    this.update(ev.scenePoint, ev.shift, ev.alt);
    this.editor.addLayer(this.shape, { select: false });
  }

  onPointerMove(ev: ToolPointerEvent) {
    if (!this.start || !this.shape) return;
    if (Math.hypot(ev.viewportPoint.x - this.editor.sceneToViewport(this.start).x, ev.viewportPoint.y - this.editor.sceneToViewport(this.start).y) > 3) {
      this.moved = true;
    }
    this.update(ev.scenePoint, ev.shift, ev.alt);
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp(ev: ToolPointerEvent) {
    if (!this.start || !this.shape) return;
    if (!this.moved) {
      // Click without drag: default-sized shape centred on the click.
      const s = this.start;
      const half = DEFAULT_SIZE / 2;
      if (this.id === 'line') this.applyLine(new Point(s.x - half, s.y), new Point(s.x + half, s.y));
      else this.applyBox(s.x - half, s.y - half, DEFAULT_SIZE, DEFAULT_SIZE);
    } else {
      this.update(ev.scenePoint, ev.shift, ev.alt);
    }
    this.finish();
  }

  private finish() {
    const shape = this.shape;
    this.shape = null;
    this.start = null;
    if (!shape) return;
    shape.setCoords();
    this.editor.selectObjects([shape]);
    const labels: Record<ShapeToolId, string> = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', polygon: 'Polygon' };
    this.editor.commit(labels[this.id]);
  }

  /** Recomputes the shape geometry from the drag start and current point. */
  private update(p: Point, shift: boolean, alt: boolean) {
    const s = this.start!;
    if (this.id === 'line') {
      let end = shift ? constrainTo45(s, p) : p;
      let start = s;
      if (alt) start = new Point(2 * s.x - end.x, 2 * s.y - end.y);
      if (start.eq(end)) end = new Point(end.x + 0.01, end.y);
      this.applyLine(start, end);
      return;
    }
    let w = p.x - s.x;
    let h = p.y - s.y;
    if (shift) {
      const m = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * m;
      h = Math.sign(h || 1) * m;
    }
    let x = w < 0 ? s.x + w : s.x;
    let y = h < 0 ? s.y + h : s.y;
    let aw = Math.abs(w);
    let ah = Math.abs(h);
    if (alt) {
      x = s.x - aw;
      y = s.y - ah;
      aw *= 2;
      ah *= 2;
    }
    this.applyBox(x, y, Math.max(aw, 1), Math.max(ah, 1));
  }

  private applyBox(x: number, y: number, w: number, h: number) {
    const shape = this.shape!;
    const center = new Point(x + w / 2, y + h / 2);
    if (shape instanceof Rect) {
      shape.set({ width: w, height: h });
    } else if (shape instanceof Ellipse) {
      shape.set({ rx: w / 2, ry: h / 2 });
    } else if (shape instanceof Polygon) {
      shape.set({ points: regularPolygonPoints(shape.samaSides ?? 6, w / 2, h / 2) });
      shape.setDimensions();
    }
    shape.setPositionByOrigin(center, 'center', 'center');
    shape.setCoords();
  }

  private applyLine(a: Point, b: Point) {
    const shape = this.shape as Path;
    (shape as unknown as { _setPath: (d: string, adjust: boolean) => void })._setPath(`M ${a.x} ${a.y} L ${b.x} ${b.y}`, true);
    shape.setCoords();
  }
}
