import { describe, expect, it } from 'vitest';
import { computeSnap } from '../../src/editor/snapping';

describe('computeSnap', () => {
  const box = { left: 98, top: 47, width: 100, height: 50 };
  it('snaps the nearest edge within the threshold', () => {
    const r = computeSnap(box, [100], [100], 5);
    expect(r.dx).toBe(2);
    expect(r.dy).toBe(3); // bottom edge 97 → 100
    expect(r.lines).toContainEqual({ orientation: 'vertical', value: 100 });
    expect(r.lines).toContainEqual({ orientation: 'horizontal', value: 100 });
  });
  it('snaps centres', () => {
    const r = computeSnap(box, [150], [], 5);
    expect(r.dx).toBe(2); // centre 148 → 150
  });
  it('does nothing outside the threshold', () => {
    const r = computeSnap(box, [300], [300], 5);
    expect(r).toEqual({ dx: 0, dy: 0, lines: [] });
  });
});
