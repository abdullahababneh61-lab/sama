/** Small geometry helpers shared by tools and the editor. */
import { Point } from 'fabric';

/**
 * Points of a regular polygon inscribed in an ellipse with radii (rx, ry),
 * centred on the origin, with the first vertex pointing straight up.
 */
export function regularPolygonPoints(sides: number, rx: number, ry: number): Point[] {
  const n = Math.max(3, Math.round(sides));
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push(new Point(rx * Math.cos(a), ry * Math.sin(a)));
  }
  return pts;
}

/** Constrains `p` relative to `origin` to the nearest 45° direction. */
export function constrainTo45(origin: Point, p: Point): Point {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return new Point(origin.x + Math.cos(angle) * len, origin.y + Math.sin(angle) * len);
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Rectangle defined by dragging from `start` to `p` — the drag logic shared by
 * the shape tools and the crop tool. Shift makes it square, Alt draws it from
 * the centre. Width and height are at least 1.
 */
export function dragBox(start: Point, p: Point, shift: boolean, alt: boolean): Box {
  const s = start;
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
  return { x, y, w: Math.max(aw, 1), h: Math.max(ah, 1) };
}
