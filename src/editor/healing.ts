/**
 * Healing blend for the Healing Brush (framework-free, unit-tested).
 *
 * A plain clone copies the source pixels as they are, so a patch taken from a
 * brighter or differently tinted area shows up as a visible block. Healing
 * keeps the source's *texture* but takes on the destination's *colour and
 * lighting*. This is Poisson ("seamless") cloning (Pérez et al., 2003):
 *
 *   result = source + correction
 *
 * where `correction` equals (destination − source) just outside the painted
 * area and is as smooth as possible inside it (it solves Laplace's equation).
 * The fine detail of the source survives unchanged, while its overall colour
 * shifts smoothly to match the edges of the destination.
 *
 * All maths is done on premultiplied RGBA so transparent pixels behave.
 */

/**
 * Heals `dest` (RGBA, `width × height`) in place.
 *
 * @param source RGBA pixels sampled from the source area, on the same grid as
 *   `dest` (already offset so source pixel i sits over destination pixel i).
 * @param weight Painted amount per pixel (0..1). Pixels above 0.5 are healed;
 *   the value also antialiases the brush edge.
 * @param valid 1 where `source` actually has a sample (inside the source image).
 */
export function healPatch(
  dest: Uint8ClampedArray,
  source: Uint8ClampedArray,
  weight: Float32Array,
  valid: Uint8Array,
  width: number,
  height: number,
): boolean {
  const n = width * height;
  const inside = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (weight[i] > 0.5 && valid[i]) {
      inside[i] = 1;
      count++;
    }
  }
  if (!count) return false;
  if (count === n) return false; // no surrounding pixels to take colour from

  const D = premultiply(dest, n);
  const S = premultiply(source, n);

  // Correction = D − S outside the painted area, harmonic inside.
  const C = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) C[i] = D[i] - S[i];
  // Where the source has no sample, the correction must not pull the fill.
  for (let i = 0; i < n; i++) if (!valid[i]) C.fill(0, i * 4, i * 4 + 4);

  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) known[i] = inside[i] ? 0 : 1;

  // Initial guess: onion-peel fill from the edge inwards (fast convergence).
  let remaining = count;
  let layers = 0;
  while (remaining > 0) {
    const ring: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (known[i]) continue;
        let w = 0;
        const acc = [0, 0, 0, 0];
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const j = yy * width + xx;
          if (!known[j]) continue;
          w++;
          for (let c = 0; c < 4; c++) acc[c] += C[j * 4 + c];
        }
        if (w) {
          for (let c = 0; c < 4; c++) C[i * 4 + c] = acc[c] / w;
          ring.push(i);
        }
      }
    }
    if (!ring.length) break;
    for (const i of ring) known[i] = 1;
    remaining -= ring.length;
    layers++;
  }

  // Relax to the harmonic solution (Gauss–Seidel; boundary values fixed).
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (inside[i]) idx.push(i);
  const iterations = Math.min(400, Math.max(30, layers * 8));
  for (let it = 0; it < iterations; it++) {
    for (const i of idx) {
      const x = i % width;
      const y = (i - x) / width;
      let k = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (j < 0) continue;
        k++;
        r += C[j * 4];
        g += C[j * 4 + 1];
        b += C[j * 4 + 2];
        a += C[j * 4 + 3];
      }
      C[i * 4] = r / k;
      C[i * 4 + 1] = g / k;
      C[i * 4 + 2] = b / k;
      C[i * 4 + 3] = a / k;
    }
  }

  // Compose: healed = source + correction, antialiased by the brush weight.
  for (let i = 0; i < n; i++) {
    const wt = valid[i] ? Math.min(1, Math.max(0, weight[i])) : 0;
    if (wt <= 0) continue;
    const o = i * 4;
    const ha = clamp(S[o + 3] + C[o + 3], 0, 255);
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 3; c++) {
      // Keep premultiplied colour within what the alpha allows.
      const healed = clamp(S[o + c] + C[o + c], 0, ha);
      out[c] = D[o + c] * (1 - wt) + healed * wt;
    }
    out[3] = D[o + 3] * (1 - wt) + ha * wt;
    const k = out[3] > 0 ? 255 / out[3] : 0;
    dest[o] = out[0] * k;
    dest[o + 1] = out[1] * k;
    dest[o + 2] = out[2] * k;
    dest[o + 3] = out[3];
  }
  return true;
}

function premultiply(data: Uint8ClampedArray, n: number): Float32Array {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    out[i * 4] = data[i * 4] * a;
    out[i * 4 + 1] = data[i * 4 + 1] * a;
    out[i * 4 + 2] = data[i * 4 + 2] * a;
    out[i * 4 + 3] = data[i * 4 + 3];
  }
  return out;
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}
