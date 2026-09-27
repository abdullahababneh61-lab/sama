import { describe, expect, it } from 'vitest';
import { anchorsToPathData, arcPathData, curvatureAnchors, polarGridLayout, rectGridLines, spiralPathData } from '../../src/editor/pathShapes';

/** Point on a cubic Bézier. */
const bez = (p0: number, c1: number, c2: number, p1: number, t: number) =>
  (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * p1;
const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe('curvature pen curve', () => {
  it('two points: a straight line; open ends and corners have no handles', () => {
    const a = curvatureAnchors([{ x: 0, y: 0 }, { x: 10, y: 0 }], [false, false], false);
    expect(a.every((k) => k.in === k.p && k.out === k.p)).toBe(true);
    const b = curvatureAnchors([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], [false, true, false], false);
    expect(b[1].in).toEqual(b[1].p);
    expect(b[1].out).toEqual(b[1].p);
  });
  it('the tangent at a smooth point is parallel to its neighbours’ chord (horizontal at a symmetric peak)', () => {
    const [, peak] = curvatureAnchors([{ x: 0, y: 100 }, { x: 100, y: 0 }, { x: 200, y: 100 }], [false, false, false], false);
    expect(peak.in.y).toBeCloseTo(0);
    expect(peak.out.y).toBeCloseTo(0);
    expect(peak.out.x - 100).toBeCloseTo(100 - peak.in.x);
  });
  it('four evenly spaced points on a circle give that circle (closed)', () => {
    const R = 100;
    const pts = [0, 1, 2, 3].map((k) => ({ x: R * Math.cos((k * Math.PI) / 2), y: R * Math.sin((k * Math.PI) / 2) }));
    const a = curvatureAnchors(pts, [false, false, false, false], true);
    for (let i = 0; i < 4; i++) {
      const p = a[i];
      const q = a[(i + 1) % 4];
      for (const t of [0.25, 0.5, 0.75]) {
        const x = bez(p.p.x, p.out.x, q.in.x, q.p.x, t);
        const y = bez(p.p.y, p.out.y, q.in.y, q.p.y, t);
        expect(Math.abs(Math.hypot(x, y) - R)).toBeLessThan(0.1);
      }
    }
    expect(anchorsToPathData(a, true).endsWith('Z')).toBe(true);
  });
});

describe('arc and spiral', () => {
  it('arc runs from start to end, leaving horizontally and arriving vertically', () => {
    const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = nums(arcPathData({ x: 10, y: 20 }, { x: 110, y: 70 }));
    expect([x0, y0, x1, y1]).toEqual([10, 20, 110, 70]);
    expect(c1y).toBe(y0);
    expect(c2x).toBe(x1);
    expect(c1x).toBeGreaterThan(x0);
    expect(c2y).toBeLessThan(y1);
    // Shift: a quarter circle.
    const sq = nums(arcPathData({ x: 0, y: 0 }, { x: 100, y: 40 }, true));
    expect(sq.slice(-2)).toEqual([100, 100]);
  });
  it('spiral starts at the centre and ends at the radius, in the given direction', () => {
    const v = nums(spiralPathData({ x: 50, y: 50 }, 100, 3, Math.PI / 2));
    expect(v.slice(0, 2)).toEqual([50, 50]);
    const [ex, ey] = v.slice(-2);
    expect(ex).toBeCloseTo(50, 1);
    expect(ey).toBeCloseTo(150, 1);
    // 3 turns × 8 segments.
    expect((spiralPathData({ x: 0, y: 0 }, 10, 3, 0).match(/C/g) ?? []).length).toBe(24);
  });
});

describe('grids', () => {
  it('rectangular grid: rows − 1 and columns − 1 evenly spaced inner lines', () => {
    const { horizontal, vertical } = rectGridLines(400, 300, 4, 5);
    expect(horizontal.map((s) => s.a.y)).toEqual([-75, 0, 75]);
    expect(vertical).toHaveLength(4);
    expect(vertical[0].a.x).toBe(-120);
  });
  it('polar grid: rings up to the radius, dividers from the centre starting straight up', () => {
    const { radii, dividers } = polarGridLayout(80, 4, 8);
    expect(radii).toEqual([20, 40, 60, 80]);
    expect(dividers).toHaveLength(8);
    expect(dividers[0].b.x).toBeCloseTo(0);
    expect(dividers[0].b.y).toBeCloseTo(-80);
  });
});
