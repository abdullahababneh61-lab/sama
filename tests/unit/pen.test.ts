import { describe, expect, it } from 'vitest';
import { Point } from 'fabric';
import { anchorsToPathData } from '../../src/editor/tools/PenTool';
import { constrainTo45, regularPolygonPoints } from '../../src/editor/geometry';

const corner = (x: number, y: number) => ({ p: new Point(x, y), in: new Point(x, y), out: new Point(x, y) });

describe('pen path data', () => {
  it('builds cubic segments between anchors', () => {
    expect(anchorsToPathData([corner(0, 0), corner(10, 0)], false)).toBe('M 0 0 C 0 0 10 0 10 0');
  });
  it('closes paths back to the first anchor', () => {
    const d = anchorsToPathData([corner(0, 0), corner(10, 0), corner(10, 10)], true);
    expect(d.endsWith('C 10 10 0 0 0 0 Z')).toBe(true);
  });
  it('uses handles for smooth anchors', () => {
    const a = { p: new Point(0, 0), in: new Point(-5, 0), out: new Point(5, 0) };
    const b = { p: new Point(20, 0), in: new Point(15, 5), out: new Point(25, -5) };
    expect(anchorsToPathData([a, b], false)).toBe('M 0 0 C 5 0 15 5 20 0');
  });
});

describe('geometry', () => {
  it('constrains to 45° steps', () => {
    const p = constrainTo45(new Point(0, 0), new Point(10, 1));
    expect(p.y).toBeCloseTo(0);
    const q = constrainTo45(new Point(0, 0), new Point(10, 9));
    expect(q.x).toBeCloseTo(q.y);
  });
  it('generates regular polygons with the first vertex on top', () => {
    const pts = regularPolygonPoints(4, 10, 10);
    expect(pts).toHaveLength(4);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(-10);
  });
});
