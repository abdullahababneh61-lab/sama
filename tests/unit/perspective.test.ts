import { describe, expect, it } from 'vitest';
import {
  applyHomography,
  clipPolygon,
  computeHomography,
  correctedSize,
  isValidQuad,
  polygonArea,
  warpInto,
} from '../../src/editor/perspective';

const rect = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 },
];
const trapezoid = [
  { x: 20, y: 10 },
  { x: 180, y: 30 },
  { x: 200, y: 160 },
  { x: 0, y: 140 },
];

describe('homography', () => {
  it('maps the four corners exactly', () => {
    const H = computeHomography(rect, trapezoid);
    rect.forEach((p, i) => {
      const q = applyHomography(H, p)!;
      expect(q.x).toBeCloseTo(trapezoid[i].x, 6);
      expect(q.y).toBeCloseTo(trapezoid[i].y, 6);
    });
  });
  it('inverts: rect → quad → rect is the identity', () => {
    const f = computeHomography(rect, trapezoid);
    const g = computeHomography(trapezoid, rect);
    const p = applyHomography(g, applyHomography(f, { x: 37, y: 12 })!)!;
    expect(p.x).toBeCloseTo(37, 6);
    expect(p.y).toBeCloseTo(12, 6);
  });
  it('is a plain scale for rectangle → rectangle', () => {
    const H = computeHomography(rect, rect.map((p) => ({ x: p.x * 2, y: p.y * 3 })));
    const p = applyHomography(H, { x: 10, y: 10 })!;
    expect(p.x).toBeCloseTo(20);
    expect(p.y).toBeCloseTo(30);
  });
  it('rejects degenerate input', () => {
    expect(() => computeHomography(rect, [rect[0], rect[0], rect[0], rect[0]])).toThrow();
  });
});

describe('quad validation and size', () => {
  it('accepts convex quads, rejects crossed or bent ones', () => {
    expect(isValidQuad(trapezoid)).toBe(true);
    expect(isValidQuad([rect[0], rect[2], rect[1], rect[3]])).toBe(false); // bow-tie
    expect(isValidQuad([rect[0], rect[1], { x: 20, y: 10 }, rect[3]])).toBe(false); // concave
    expect(isValidQuad([rect[0], rect[0], rect[0], rect[0]])).toBe(false);
  });
  it('uses the longer of each pair of opposite edges', () => {
    const s = correctedSize(trapezoid);
    expect(s.width).toBe(Math.round(Math.hypot(200, 20)));
    expect(s.height).toBe(Math.round(Math.hypot(20, 130)));
  });
});

describe('clipPolygon', () => {
  it('intersects a box with a quad', () => {
    const box = [
      { x: 50, y: 25 },
      { x: 150, y: 25 },
      { x: 150, y: 125 },
      { x: 50, y: 125 },
    ];
    const clipped = clipPolygon(box, rect);
    expect(Math.abs(polygonArea(clipped))).toBeCloseTo(50 * 25);
    expect(clipPolygon([{ x: 500, y: 500 }, { x: 600, y: 500 }, { x: 600, y: 600 }], rect)).toEqual([]);
  });
});

describe('warpInto', () => {
  it('straightens a quad back to a rectangle of solid colour', () => {
    // Source: a 200×200 raster, opaque red inside the trapezoid only.
    const sw = 200;
    const sh = 200;
    const data = new Uint8ClampedArray(sw * sh * 4);
    const H = computeHomography(trapezoid, rect);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const p = applyHomography(H, { x: x + 0.5, y: y + 0.5 });
        if (p && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 50) {
          const o = (y * sw + x) * 4;
          data[o] = 255;
          data[o + 3] = 255;
        }
      }
    }
    const out = new Uint8ClampedArray(100 * 50 * 4);
    const any = warpInto({ data, width: sw, height: sh, originX: 0, originY: 0, scale: 1 }, computeHomography(rect, trapezoid), out, 0, 0, 100, 50);
    expect(any).toBe(true);
    // Every interior pixel of the result is red and opaque.
    for (const [x, y] of [[5, 5], [50, 25], [94, 44]]) {
      const o = (y * 100 + x) * 4;
      expect(out[o]).toBe(255);
      expect(out[o + 3]).toBeGreaterThan(250);
    }
  });
});
