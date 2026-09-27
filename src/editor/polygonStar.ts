/**
 * Polygons and stars made by the Polygon / Star tool: ordinary Fabric
 * polygons (layer kind "polygon") that remember how they were made in
 * `samaParams`, so their sides/points (and a star's inner radius) can be
 * changed after drawing without moving or reshaping anything else.
 *
 * The vertices are stored centred on the shape's centre — path point
 * (0, 0) is always the centre — which is what lets a rebuild keep the centre
 * in place whatever the layer's position, size or rotation.
 */
import { Point, Polygon, util } from 'fabric';
import { regularPolygonVertices, starVertices, uprightAngle, type XY } from './pathShapes';
import type { ShapeParams } from './types';

export type PolygonStarParams = Extract<ShapeParams, { type: 'polygon' } | { type: 'star' }>;

export interface ShapePaint {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
}

/** The vertices (centred on (0, 0)) for a polygon or star. */
export function polygonStarVertices(params: PolygonStarParams): XY[] {
  return params.type === 'star'
    ? starVertices(params.points, params.radius, params.innerRatio, params.angle)
    : regularPolygonVertices(params.sides, params.radius, params.angle);
}

/** Sides of a polygon or points of a star. */
export const polygonStarCount = (params: PolygonStarParams) => (params.type === 'star' ? params.points : params.sides);

/**
 * The same shape with a new number of sides/points. A shape that was
 * upright stays upright (a pentagon stood on its base becomes a hexagon
 * with flat top and bottom, not one balanced on a corner).
 */
export function withCount(params: PolygonStarParams, count: number): PolygonStarParams {
  const star = params.type === 'star';
  const n = Math.max(star ? 2 : 3, Math.min(100, Math.round(count)));
  const wasUpright = Math.abs(params.angle - uprightAngle(polygonStarCount(params), star)) < 1e-6;
  const angle = wasUpright ? uprightAngle(n, star) : params.angle;
  return star ? { ...params, points: n, angle } : { ...params, sides: n, angle };
}

/** A new polygon/star layer centred on `center`, painted like the shape tools. */
export function createPolygonStar(center: XY, params: PolygonStarParams, paint: ShapePaint): Polygon {
  const poly = new Polygon(polygonStarVertices(params), {
    fill: paint.fill ?? '',
    stroke: paint.stroke ?? '',
    strokeWidth: paint.stroke ? paint.strokeWidth : 0,
    strokeUniform: true,
    strokeLineJoin: 'miter',
  });
  // The constructor put path point (0, 0) at scene (0, 0): move it to the centre.
  poly.set({ left: poly.left + center.x, top: poly.top + center.y });
  poly.samaKind = 'polygon';
  poly.samaSides = polygonStarCount(params);
  poly.samaParams = params;
  if (params.type === 'star') poly.samaName = 'Star';
  poly.setCoords();
  return poly;
}

/** Rebuilds a polygon/star with new settings, keeping its centre where it is on screen. */
export function rebuildPolygonStar(poly: Polygon, params: PolygonStarParams) {
  const centreOf = () => util.transformPoint(new Point(-poly.pathOffset.x, -poly.pathOffset.y), poly.calcTransformMatrix());
  const before = centreOf();
  poly.set({ points: polygonStarVertices(params) });
  poly.setDimensions();
  poly.samaSides = polygonStarCount(params);
  poly.samaParams = params;
  poly.setCoords();
  const after = centreOf();
  let delta = new Point(before.x - after.x, before.y - after.y);
  const parent = poly.group ?? poly.parent;
  if (parent) delta = util.sendVectorToPlane(delta, undefined, parent.calcTransformMatrix());
  poly.set({ left: poly.left + delta.x, top: poly.top + delta.y, dirty: true });
  poly.setCoords();
}

/** Is this a polygon/star made by the Polygon / Star tool? */
export function isPolygonStar(obj: unknown): obj is Polygon & { samaParams: PolygonStarParams } {
  const p = (obj as { samaParams?: ShapeParams } | null)?.samaParams;
  return obj instanceof Polygon && (p?.type === 'polygon' || p?.type === 'star');
}
