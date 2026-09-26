import { describe, expect, it } from 'vitest';
import { distanceToMask, inpaint } from '../../src/editor/inpaint';

function image(w: number, h: number, color: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = color(x, y);
      d.set(c, (y * w + x) * 4);
    }
  return d;
}
function disc(w: number, h: number, cx: number, cy: number, r: number) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * w + x] = 1;
  return m;
}
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => [...d.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];

describe('inpaint', () => {
  it('removes a blemish from a flat colour completely', () => {
    const w = 60;
    const h = 60;
    const mask = disc(w, h, 30, 30, 8);
    const d = image(w, h, (x, y) => (mask[y * w + x] ? [0, 0, 0, 255] : [200, 150, 100, 255]));
    expect(inpaint(d, w, h, mask, { feather: 3 })).toBe(true);
    for (const [x, y] of [[30, 30], [25, 33], [36, 28]]) {
      const [r, g, b, a] = px(d, w, x, y);
      expect(Math.abs(r - 200)).toBeLessThanOrEqual(1);
      expect(Math.abs(g - 150)).toBeLessThanOrEqual(1);
      expect(Math.abs(b - 100)).toBeLessThanOrEqual(1);
      expect(a).toBe(255);
    }
  });

  it('continues a gradient across the hole', () => {
    const w = 80;
    const h = 40;
    const mask = disc(w, h, 40, 20, 8);
    const d = image(w, h, (x, y) => (mask[y * w + x] ? [255, 0, 0, 255] : [x * 3, x * 3, x * 3, 255]));
    inpaint(d, w, h, mask, { feather: 2, grain: 0 });
    const [r, g] = px(d, w, 40, 20);
    expect(Math.abs(r - 120)).toBeLessThan(8); // ≈ the gradient's value at x = 40
    expect(Math.abs(r - g)).toBeLessThan(3); // the red blemish is gone
  });

  it('leaves pixels far from the mask untouched', () => {
    const w = 40;
    const h = 40;
    const mask = disc(w, h, 20, 20, 4);
    const d = image(w, h, (x) => [x * 5, 0, 0, 255]);
    const before = d.slice();
    inpaint(d, w, h, mask, { feather: 2 });
    expect(px(d, w, 2, 2)).toEqual([...before.slice((2 * w + 2) * 4, (2 * w + 2) * 4 + 4)]);
  });

  it('refuses when there is nothing around to sample', () => {
    const d = image(4, 4, () => [0, 0, 0, 255]);
    expect(inpaint(d, 4, 4, new Uint8Array(16).fill(1), { feather: 1 })).toBe(false);
  });

  it('distance transform grows from the mask', () => {
    const m = new Uint8Array(25);
    m[12] = 1; // centre of 5×5
    const dist = distanceToMask(m, 5, 5);
    expect(dist[12]).toBe(0);
    expect(dist[13]).toBeCloseTo(1);
    expect(dist[14]).toBeCloseTo(2);
  });
});
