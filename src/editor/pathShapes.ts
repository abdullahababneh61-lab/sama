/**
 * Geometry of the generated paths: the Curvature Pen's smooth curve through
 * points, arcs, spirals and grid layouts. Pure functions (no Fabric), so they
 * are easy to test; the tools turn their output into Fabric objects.
 *
 * Curves are cubic Béziers, written as SVG path data like the Pen tool's, so
 * the results are ordinary paths that Direct Selection (A) can edit.
 */
export interface XY {
  x: number;
  y: number;
}

/** An anchor with its incoming and outgoing handles (absolute coordinates). */
export interface CurveAnchor {
  p: XY;
  in: XY;
  out: XY;
}

const round = (n: number) => Math.round(n * 100) / 100;
const dist = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);

/** SVG path data for anchors joined by cubic Béziers (closed: back to the first). */
export function anchorsToPathData(anchors: CurveAnchor[], closed: boolean): string {
  if (!anchors.length) return '';
  const parts = [`M ${round(anchors[0].p.x)} ${round(anchors[0].p.y)}`];
  const seg = (a: CurveAnchor, b: CurveAnchor) =>
    `C ${round(a.out.x)} ${round(a.out.y)} ${round(b.in.x)} ${round(b.in.y)} ${round(b.p.x)} ${round(b.p.y)}`;
  for (let i = 1; i < anchors.length; i++) parts.push(seg(anchors[i - 1], anchors[i]));
  if (closed && anchors.length > 2) {
    parts.push(seg(anchors[anchors.length - 1], anchors[0]));
    parts.push('Z');
  }
  return parts.join(' ');
}

/**
 * Handle length as a share of the chord, for a point where the curve turns
 * by `turn` radians. Chosen so that evenly spaced points on a circle give
 * (almost exactly) that circle; tends to 1/3 — plain Catmull-Rom — for
 * gentle bends.
 */
function handleShare(turn: number): number {
  const t = Math.min(Math.abs(turn), (5 * Math.PI) / 6);
  if (t < 1e-3) return 1 / 3;
  return ((2 / 3) * Math.tan(t / 4)) / Math.sin(t / 2);
}

/**
 * The Curvature Pen's curve: a smooth path through every point (no handles
 * to manage). At each smooth point the tangent is parallel to the line
 * joining its two neighbours (Catmull-Rom style), and each handle's length
 * follows the distance to the neighbour on its side, so uneven spacing
 * doesn't cause loops. Corner points get no handles (a sharp corner). On an
 * open path the two ends are corners; two points make a straight line.
 */
export function curvatureAnchors(points: XY[], corners: boolean[], closed: boolean): CurveAnchor[] {
  const n = points.length;
  return points.map((p, i) => {
    const flat = { p, in: p, out: p };
    const isEnd = !closed && (i === 0 || i === n - 1);
    if (n < 3 || isEnd || corners[i]) return flat;
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return flat;
    const ux = dx / len;
    const uy = dy / len;
    // How sharply the curve turns here (angle between the two chords).
    const a1 = Math.atan2(p.y - prev.y, p.x - prev.x);
    const a2 = Math.atan2(next.y - p.y, next.x - p.x);
    let turn = a2 - a1;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    const k = handleShare(turn);
    const lin = dist(prev, p) * k;
    const lout = dist(p, next) * k;
    return { p, in: { x: p.x - ux * lin, y: p.y - uy * lin }, out: { x: p.x + ux * lout, y: p.y + uy * lout } };
  });
}

/** Handle length for a quarter ellipse, as a share of the radius. */
const KAPPA = 0.5522847498;

/**
 * An arc from `a` to `b`: a quarter ellipse that leaves `a` horizontally and
 * arrives at `b` vertically, so it bulges towards the corner the drag heads
 * for (dragging the other way flips the bulge). `square` makes it a quarter
 * circle (the larger of the two extents).
 */
export function arcPathData(a: XY, b: XY, square = false): string {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const r = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * r;
    dy = Math.sign(dy || 1) * r;
  }
  const end = { x: a.x + dx, y: a.y + dy };
  const c1 = { x: a.x + dx * KAPPA, y: a.y };
  const c2 = { x: end.x, y: end.y - dy * KAPPA };
  return `M ${round(a.x)} ${round(a.y)} C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`;
}

/** Segments per turn used to draw a spiral (plenty for a smooth curve). */
const SPIRAL_SEGMENTS_PER_TURN = 8;

/**
 * An Archimedean spiral around `c`: it starts at the centre and winds
 * outwards `turns` times (clockwise on screen), its radius growing evenly,
 * ending at distance `radius` in direction `angle` (radians, 0 = right).
 */
export function spiralPathData(c: XY, radius: number, turns: number, angle: number): string {
  const total = Math.max(0.25, turns) * Math.PI * 2;
  const segs = Math.max(2, Math.ceil(Math.max(0.25, turns) * SPIRAL_SEGMENTS_PER_TURN));
  const start = angle - total;
  const point = (t: number) => {
    const r = (radius * t) / total;
    const a = start + t;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  };
  // Derivative with respect to t: r'·(cos, sin) + r·(−sin, cos).
  const tangent = (t: number) => {
    const r = (radius * t) / total;
    const dr = radius / total;
    const a = start + t;
    return { x: dr * Math.cos(a) - r * Math.sin(a), y: dr * Math.sin(a) + r * Math.cos(a) };
  };
  const step = total / segs;
  const p0 = point(0);
  const parts = [`M ${round(p0.x)} ${round(p0.y)}`];
  for (let k = 0; k < segs; k++) {
    const t0 = k * step;
    const t1 = (k + 1) * step;
    const a = point(t0);
    const b = point(t1);
    const da = tangent(t0);
    const db = tangent(t1);
    const h = step / 3;
    parts.push(
      `C ${round(a.x + da.x * h)} ${round(a.y + da.y * h)} ${round(b.x - db.x * h)} ${round(b.y - db.y * h)} ${round(b.x)} ${round(b.y)}`,
    );
  }
  return parts.join(' ');
}

export interface Segment {
  a: XY;
  b: XY;
}

/**
 * Inner dividing lines of a rectangular grid centred on (0, 0): `rows − 1`
 * horizontal and `columns − 1` vertical lines. The outer frame is separate.
 */
export function rectGridLines(width: number, height: number, rows: number, columns: number): { horizontal: Segment[]; vertical: Segment[] } {
  const x0 = -width / 2;
  const y0 = -height / 2;
  const horizontal: Segment[] = [];
  const vertical: Segment[] = [];
  for (let i = 1; i < rows; i++) {
    const y = y0 + (height * i) / rows;
    horizontal.push({ a: { x: x0, y }, b: { x: x0 + width, y } });
  }
  for (let j = 1; j < columns; j++) {
    const x = x0 + (width * j) / columns;
    vertical.push({ a: { x, y: y0 }, b: { x, y: y0 + height } });
  }
  return { horizontal, vertical };
}

/**
 * A polar grid centred on (0, 0): the radii of its concentric circles (the
 * outer one is `radius`) and its dividers from the centre to the edge, the
 * first pointing straight up.
 */
export function polarGridLayout(radius: number, rings: number, dividers: number): { radii: number[]; dividers: Segment[] } {
  const radii: number[] = [];
  for (let i = 1; i <= rings; i++) radii.push((radius * i) / rings);
  const lines: Segment[] = [];
  for (let k = 0; k < dividers; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / dividers;
    lines.push({ a: { x: 0, y: 0 }, b: { x: radius * Math.cos(a), y: radius * Math.sin(a) } });
  }
  return { radii, dividers: lines };
}

/**
 * Vertices of a regular polygon centred on (0, 0) with circumradius
 * `radius`; the first vertex points in direction `angle` (radians).
 */
export function regularPolygonVertices(sides: number, radius: number, angle: number): XY[] {
  const n = Math.max(3, Math.round(sides));
  const out: XY[] = [];
  for (let k = 0; k < n; k++) {
    const a = angle + (k * 2 * Math.PI) / n;
    out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return out;
}

/**
 * Vertices of a star centred on (0, 0): `points` outer tips at `radius`
 * alternating with inner corners at `radius × innerRatio / 100`; the first
 * tip points in direction `angle`.
 */
export function starVertices(points: number, radius: number, innerRatio: number, angle: number): XY[] {
  const n = Math.max(2, Math.round(points));
  const inner = (radius * Math.max(1, Math.min(100, innerRatio))) / 100;
  const out: XY[] = [];
  for (let k = 0; k < n * 2; k++) {
    const a = angle + (k * Math.PI) / n;
    const r = k % 2 ? inner : radius;
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return out;
}

/**
 * The upright orientation (Shift) — the angle of the first vertex, as the
 * common drawing tools do it: a star has a tip straight up; a polygon sits
 * on a flat bottom edge (so odd polygons point up, and even ones such as a
 * square or hexagon have flat top and bottom sides).
 */
export function uprightAngle(count: number, star: boolean): number {
  const up = -Math.PI / 2;
  if (star) return up;
  const n = Math.max(3, Math.round(count));
  return n % 2 ? up : up + Math.PI / n;
}
