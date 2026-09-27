/**
 * Fabric objects for the generated shapes — spirals and rectangular/polar
 * grids — and how to rebuild one in place with new settings.
 *
 * Each result carries its settings in `samaParams` (sizes in its own,
 * unscaled units), so the options bar can change e.g. a grid's rows after it
 * was drawn. A rebuilt shape keeps its position, size, rotation, id, name
 * and stacking place; only its insides change.
 */
import { Ellipse, Group, Path, Point, Rect, util, type FabricObject } from 'fabric';
import { polarGridLayout, rectGridLines, spiralPathData, type Segment, type XY } from './pathShapes';
import type { ShapeParams } from './types';

export interface LineStyle {
  stroke: string;
  strokeWidth: number;
}

const lineProps = (style: LineStyle) => ({
  fill: '',
  stroke: style.stroke,
  strokeWidth: Math.max(0.1, style.strokeWidth),
  strokeUniform: true,
  strokeLineCap: 'round' as const,
  strokeLineJoin: 'round' as const,
});

const segmentPath = (s: Segment, style: LineStyle, name: string) => {
  const p = new Path(`M ${s.a.x} ${s.a.y} L ${s.b.x} ${s.b.y}`, lineProps(style));
  p.samaKind = 'line';
  p.samaName = name;
  return p;
};

/**
 * A spiral path. Its path coordinates are centred on the spiral's centre, so
 * the centre is always at path point (0, 0); the object is placed so that
 * point lands on `center`.
 */
export function createSpiral(center: XY, radius: number, turns: number, angle: number, style: LineStyle): Path {
  const path = new Path(spiralPathData({ x: 0, y: 0 }, radius, turns, angle), lineProps(style));
  // The constructor put path point (0, 0) at scene (0, 0): shift it to the centre.
  path.set({ left: path.left + center.x, top: path.top + center.y });
  path.samaKind = 'path';
  path.samaName = 'Spiral';
  path.samaParams = { type: 'spiral', turns, radius, angle };
  path.setCoords();
  return path;
}

/** A rectangular grid (outer frame + dividing lines) as one group, centred on `center`. */
export function createRectGrid(center: XY, width: number, height: number, rows: number, columns: number, style: LineStyle): Group {
  const frame = new Rect({ ...lineProps(style), left: 0, top: 0, width, height, originX: 'center', originY: 'center' });
  frame.samaKind = 'rect';
  frame.samaName = 'Frame';
  const { horizontal, vertical } = rectGridLines(width, height, rows, columns);
  const children: FabricObject[] = [
    frame,
    ...horizontal.map((s, i) => segmentPath(s, style, `Row line ${i + 1}`)),
    ...vertical.map((s, i) => segmentPath(s, style, `Column line ${i + 1}`)),
  ];
  const group = new Group(children);
  group.samaKind = 'group';
  group.samaName = 'Grid';
  group.samaParams = { type: 'rectGrid', rows, columns, width, height };
  group.setPositionByOrigin(new Point(center.x, center.y), 'center', 'center');
  group.setCoords();
  return group;
}

/** A polar grid (concentric circles + dividers from the centre) as one group, centred on `center`. */
export function createPolarGrid(center: XY, radius: number, rings: number, dividers: number, style: LineStyle): Group {
  const layout = polarGridLayout(radius, rings, dividers);
  const children: FabricObject[] = [
    ...layout.radii.map((r, i) => {
      const e = new Ellipse({ ...lineProps(style), left: 0, top: 0, rx: r, ry: r, originX: 'center', originY: 'center' });
      e.samaKind = 'ellipse';
      e.samaName = `Ring ${i + 1}`;
      return e;
    }),
    ...layout.dividers.map((s, i) => segmentPath(s, style, `Divider ${i + 1}`)),
  ];
  const group = new Group(children);
  group.samaKind = 'group';
  group.samaName = 'Polar grid';
  group.samaParams = { type: 'polarGrid', rings, dividers, radius };
  group.setPositionByOrigin(new Point(center.x, center.y), 'center', 'center');
  group.setCoords();
  return group;
}

/** The line style a generated shape currently uses (it may have been restyled since). */
function styleOf(obj: FabricObject, fallback: LineStyle): LineStyle {
  const src = obj instanceof Group ? obj.getObjects()[0] : obj;
  return {
    stroke: typeof src?.stroke === 'string' && src.stroke ? src.stroke : fallback.stroke,
    strokeWidth: src?.strokeWidth || fallback.strokeWidth,
  };
}

/**
 * Settings changed after drawing: rebuilds `obj` with `params`.
 *
 * - Spiral: the path data is regenerated in place, keeping the spiral's
 *   centre where it was on screen.
 * - Grids: returns a new group (same size and transform) that the caller
 *   swaps in with `Editor.replaceLayer`.
 *
 * Returns the object to keep (the same spiral, or the new grid).
 */
export function rebuildGenerated(obj: FabricObject, params: ShapeParams, fallback: LineStyle): FabricObject {
  const style = styleOf(obj, fallback);
  if (params.type === 'spiral' && obj instanceof Path) {
    const centreOf = (p: Path) => util.transformPoint(new Point(-p.pathOffset.x, -p.pathOffset.y), p.calcTransformMatrix());
    const before = centreOf(obj);
    (obj as unknown as { _setPath: (d: string, adjust: boolean) => void })._setPath(
      spiralPathData({ x: 0, y: 0 }, params.radius, params.turns, params.angle),
      false,
    );
    obj.samaParams = params;
    obj.setCoords();
    const after = centreOf(obj);
    // Move by the drift, expressed in the object's parent plane.
    let delta = new Point(before.x - after.x, before.y - after.y);
    const parent = obj.group ?? obj.parent;
    if (parent) delta = util.sendVectorToPlane(delta, undefined, parent.calcTransformMatrix());
    obj.set({ left: obj.left + delta.x, top: obj.top + delta.y, dirty: true });
    obj.setCoords();
    return obj;
  }
  let next: Group;
  if (params.type === 'rectGrid') next = createRectGrid({ x: 0, y: 0 }, params.width, params.height, params.rows, params.columns, style);
  else if (params.type === 'polarGrid') next = createPolarGrid({ x: 0, y: 0 }, params.radius, params.rings, params.dividers, style);
  else return obj;
  next.set({
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
    angle: obj.angle,
    skewX: obj.skewX,
    skewY: obj.skewY,
    flipX: obj.flipX,
    flipY: obj.flipY,
    opacity: obj.opacity,
    visible: obj.visible,
    globalCompositeOperation: obj.globalCompositeOperation,
  });
  return next;
}
