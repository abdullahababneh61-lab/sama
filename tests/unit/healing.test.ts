import { describe, expect, it } from 'vitest';
import { healPatch } from '../../src/editor/healing';

const W = 60;
const H = 60;
function fill(fn: (x: number, y: number) => [number, number, number]) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fn(x, y);
      d.set([r, g, b, 255], (y * W + x) * 4);
    }
  return d;
}
function disc(r: number) {
  const wt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - 30) ** 2 + (y - 30) ** 2 <= r * r) wt[y * W + x] = 1;
  return wt;
}
const stats = (d: Uint8ClampedArray, wt: Float32Array, c: number) => {
  const v: number[] = [];
  for (let i = 0; i < W * H; i++) if (wt[i] > 0.5) v.push(d[i * 4 + c]);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { mean, sd };
};

describe('healPatch', () => {
  it('keeps the source texture but adopts the destination colour', () => {
    // Destination: flat warm tone with a dark blemish in the middle.
    const wt = disc(10);
    const dest = fill((x, y) => (wt[y * W + x] ? [20, 10, 5] : [200, 150, 120]));
    // Source: a much darker, bluish area with a strong stripe texture.
    const source = fill((x) => (x % 4 < 2 ? [40, 60, 110] : [80, 100, 150]));
    const valid = new Uint8Array(W * H).fill(1);
    expect(healPatch(dest, source, wt, valid, W, H)).toBe(true);
    const r = stats(dest, wt, 0);
    const b = stats(dest, wt, 2);
    // Colour matches the surroundings (not the dark blue source, not the blemish)…
    expect(Math.abs(r.mean - 200)).toBeLessThan(6);
    expect(Math.abs(b.mean - 120)).toBeLessThan(6);
    // …while the stripe texture (±20) carries over.
    expect(r.sd).toBeGreaterThan(15);
  });

  it('leaves pixels outside the brush untouched', () => {
    const wt = disc(6);
    const dest = fill(() => [100, 100, 100]);
    const before = dest.slice();
    healPatch(dest, fill(() => [0, 0, 0]), wt, new Uint8Array(W * H).fill(1), W, H);
    expect(dest.slice(0, 40)).toEqual(before.slice(0, 40));
  });

  it('does nothing where the source has no pixels', () => {
    const wt = disc(6);
    const dest = fill(() => [100, 100, 100]);
    expect(healPatch(dest, fill(() => [0, 0, 0]), wt, new Uint8Array(W * H), W, H)).toBe(false);
  });
});
