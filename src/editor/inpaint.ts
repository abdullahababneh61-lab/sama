/**
 * Simple content-aware fill ("inpainting") for the Spot Healing Brush.
 * Framework-free and unit-tested.
 *
 * Given an RGBA image and a mask of pixels to remove, it rebuilds the masked
 * area from the pixels around it:
 *
 * 1. Grow the mask by a feather band, so the repair blends into its edges.
 * 2. Onion-peel fill: fill the hole ring by ring from the outside in, each
 *    pixel taking the average of its already-known neighbours.
 * 3. Smooth: repeatedly replace each hole pixel with the average of its four
 *    neighbours (a "harmonic" fill), which removes the ring pattern of step 2
 *    and gives a seamless gradient between the surrounding colours.
 * 4. Grain: add fine noise matching the texture measured just outside the
 *    hole, so the patch doesn't look unnaturally smooth on photos.
 * 5. Feather: inside the original mask the repair replaces the pixels; across
 *    the feather band it fades back to the original.
 *
 * Colours are processed premultiplied by alpha so transparent pixels don't
 * bleed dark colour into the repair.
 */

export interface InpaintOptions {
  /** Width (px) of the soft transition band around the mask. */
  feather: number;
  /** Seed for the grain noise (results are reproducible). */
  seed?: number;
  /** Strength of the matching grain, 0 = none, 1 = measured texture. */
  grain?: number;
}

/**
 * Inpaints `data` (RGBA, `width × height`) in place where `mask[i]` is non-zero.
 * Returns false when there is nothing to fill from (the mask covers everything).
 */
export function inpaint(data: Uint8ClampedArray, width: number, height: number, mask: Uint8Array, opts: InpaintOptions): boolean {
  const n = width * height;
  const feather = Math.max(0, opts.feather);
  const grain = opts.grain ?? 1;

  // 1. Distance (px) from the mask, and the hole = mask grown by the feather.
  const dist = distanceToMask(mask, width, height);
  const hole = new Uint8Array(n);
  let holeCount = 0;
  for (let i = 0; i < n; i++) {
    if (dist[i] <= feather) {
      hole[i] = 1;
      holeCount++;
    }
  }
  if (!holeCount) return true;
  if (holeCount === n) return false;

  // Premultiplied working copy.
  const px = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    px[i * 4] = data[i * 4] * a;
    px[i * 4 + 1] = data[i * 4 + 1] * a;
    px[i * 4 + 2] = data[i * 4 + 2] * a;
    px[i * 4 + 3] = data[i * 4 + 3];
  }
  const original = px.slice();

  // 2. Onion-peel fill.
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) known[i] = hole[i] ? 0 : 1;
  let remaining = holeCount;
  let layers = 0;
  const offsets = [
    [-1, 0, 1],
    [1, 0, 1],
    [0, -1, 1],
    [0, 1, 1],
    [-1, -1, 0.7],
    [1, -1, 0.7],
    [-1, 1, 0.7],
    [1, 1, 0.7],
  ];
  while (remaining > 0) {
    const ring: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (known[i]) continue;
        let w = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (const [dx, dy, wt] of offsets) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const j = yy * width + xx;
          if (!known[j]) continue;
          w += wt;
          r += px[j * 4] * wt;
          g += px[j * 4 + 1] * wt;
          b += px[j * 4 + 2] * wt;
          a += px[j * 4 + 3] * wt;
        }
        if (w > 0) {
          px[i * 4] = r / w;
          px[i * 4 + 1] = g / w;
          px[i * 4 + 2] = b / w;
          px[i * 4 + 3] = a / w;
          ring.push(i);
        }
      }
    }
    if (!ring.length) break; // disconnected (can't happen unless nothing is known)
    for (const i of ring) known[i] = 1;
    remaining -= ring.length;
    layers++;
  }

  // 3. Harmonic smoothing (Gauss–Seidel), boundary pixels stay fixed.
  const iterations = Math.min(300, Math.max(20, layers * 6));
  const holeIdx: number[] = [];
  for (let i = 0; i < n; i++) if (hole[i]) holeIdx.push(i);
  for (let it = 0; it < iterations; it++) {
    for (const i of holeIdx) {
      const x = i % width;
      const y = (i - x) / width;
      let c = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (j < 0) continue;
        c++;
        r += px[j * 4];
        g += px[j * 4 + 1];
        b += px[j * 4 + 2];
        a += px[j * 4 + 3];
      }
      px[i * 4] = r / c;
      px[i * 4 + 1] = g / c;
      px[i * 4 + 2] = b / c;
      px[i * 4 + 3] = a / c;
    }
  }

  // 4. Grain matching the texture in a band just outside the hole.
  const sigma = grain > 0 ? measureGrain(original, width, height, dist, feather) * grain : 0;
  const rand = mulberry32(opts.seed ?? 1);

  // 5. Feathered composite back into `data`.
  for (const i of holeIdx) {
    const d = dist[i];
    // 1 inside the painted mask, fading to 0 at the outer edge of the feather band.
    const t = d === 0 ? 1 : smoothstep(1 - d / (feather + 1));
    let r = px[i * 4];
    let g = px[i * 4 + 1];
    let b = px[i * 4 + 2];
    const a = px[i * 4 + 3];
    if (sigma > 0) {
      const noise = gaussian(rand) * sigma * (a / 255);
      r += noise;
      g += noise;
      b += noise;
    }
    const o = i * 4;
    const fr = original[o] * (1 - t) + r * t;
    const fg = original[o + 1] * (1 - t) + g * t;
    const fb = original[o + 2] * (1 - t) + b * t;
    const fa = original[o + 3] * (1 - t) + a * t;
    const k = fa > 0 ? 255 / fa : 0;
    data[o] = fr * k;
    data[o + 1] = fg * k;
    data[o + 2] = fb * k;
    data[o + 3] = fa;
  }
  return true;
}

/** Chamfer (3-4) distance, in pixels, from each pixel to the nearest masked pixel. */
export function distanceToMask(mask: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? INF : d[y * width + x]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** Typical per-pixel luminance deviation from the local 3×3 mean, just outside the hole. */
function measureGrain(px: Float32Array, width: number, height: number, dist: Float32Array, feather: number): number {
  let sum = 0;
  let count = 0;
  const lum = (i: number) => {
    const a = px[i * 4 + 3];
    if (a <= 0) return 0;
    return (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) * (255 / a);
  };
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (dist[i] <= feather || dist[i] > feather + 6) continue;
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m += lum(i + dy * width + dx);
      sum += Math.abs(lum(i) - m / 9);
      count++;
    }
  }
  // Mean absolute deviation → standard deviation (for roughly normal grain).
  return count ? (sum / count) * 1.25 : 0;
}

function smoothstep(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box–Muller). */
function gaussian(rand: () => number) {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
