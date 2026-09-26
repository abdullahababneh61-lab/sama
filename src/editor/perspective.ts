/**
 * Perspective maths for the Perspective Crop tool (framework-free, unit-tested).
 *
 * A perspective (projective) transform — a "homography" — is what maps a
 * rectangle seen at an angle (a trapezoid-like quadrilateral) back onto a
 * straight-on rectangle. It is described by a 3×3 matrix `H`:
 *
 *   u = (h0·x + h1·y + h2) / (h6·x + h7·y + 1)
 *   v = (h3·x + h4·y + h5) / (h6·x + h7·y + 1)
 */

export interface XY {
  x: number;
  y: number;
}

/** 3×3 matrix stored row-major as 9 numbers (h8 is always 1). */
export type Homography = [number, number, number, number, number, number, number, number, number];

/**
 * Computes the homography that maps each of the four `from` points onto the
 * matching `to` point. Throws when the points are degenerate (e.g. three on
 * one line).
 */
export function computeHomography(from: XY[], to: XY[]): Homography {
  if (from.length !== 4 || to.length !== 4) throw new Error('Four point pairs are required');
  // Build the 8×8 linear system A·h = b.
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Applies a homography to a point. Returns null for points "behind the horizon". */
export function applyHomography(H: Homography, p: XY): XY | null {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (w <= 1e-12) return null;
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

/** Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-10) throw new Error('Degenerate quadrilateral');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * True when the quadrilateral (corners in order) is convex, not self-crossing
 * and not collapsed — the only shapes a perspective crop can correct.
 */
export function isValidQuad(q: XY[], minArea = 4): boolean {
  if (q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return Math.abs(polygonArea(q)) >= minArea;
}

export function polygonArea(poly: XY[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Size of the corrected rectangle for a quad given as [top-left, top-right,
 * bottom-right, bottom-left]: the longer of each pair of opposite edges, like
 * Photoshop does.
 */
export function correctedSize(q: XY[]): { width: number; height: number } {
  const d = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);
  return {
    width: Math.max(1, Math.round(Math.max(d(q[0], q[1]), d(q[3], q[2])))),
    height: Math.max(1, Math.round(Math.max(d(q[0], q[3]), d(q[1], q[2])))),
  };
}

/**
 * Clips a polygon against a convex polygon (Sutherland–Hodgman). Both must be
 * given in the same winding order.
 */
export function clipPolygon(subject: XY[], clip: XY[]): XY[] {
  const orientation = Math.sign(polygonArea(clip)) || 1;
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p: XY) => orientation * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
    const intersect = (p: XY, q: XY): XY => {
      const dx1 = q.x - p.x;
      const dy1 = q.y - p.y;
      const dx2 = b.x - a.x;
      const dy2 = b.y - a.y;
      const den = dx1 * dy2 - dy1 * dx2;
      const t = den === 0 ? 0 : ((a.x - p.x) * dy2 - (a.y - p.y) * dx2) / den;
      return { x: p.x + t * dx1, y: p.y + t * dy1 };
    };
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) output.push(intersect(prev, cur));
        output.push(cur);
      } else if (inside(prev)) {
        output.push(intersect(prev, cur));
      }
    }
  }
  return output;
}

/** Pixels of a rendered region of the scene. */
export interface SourceRaster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Scene coordinates of the raster's top-left corner. */
  originX: number;
  originY: number;
  /** Raster pixels per scene unit. */
  scale: number;
}

/**
 * Fills `out` (an RGBA buffer of `outW × outH` pixels whose top-left sits at
 * (outX, outY) in the corrected image) by pulling each pixel back through
 * `toScene` (corrected image → scene) and sampling `src` bilinearly.
 * Interpolation is done on premultiplied colour so transparent edges don't
 * get dark fringes. Returns true if any pixel is non-transparent.
 */
export function warpInto(
  src: SourceRaster,
  toScene: Homography,
  out: Uint8ClampedArray,
  outX: number,
  outY: number,
  outW: number,
  outH: number,
): boolean {
  const { data, width: sw, height: sh, originX, originY, scale } = src;
  const H = toScene;
  let any = false;
  for (let j = 0; j < outH; j++) {
    const v = outY + j + 0.5;
    for (let i = 0; i < outW; i++) {
      const u = outX + i + 0.5;
      const w = H[6] * u + H[7] * v + H[8];
      const o = (j * outW + i) * 4;
      if (w <= 1e-12) continue;
      const sx = ((H[0] * u + H[1] * v + H[2]) / w - originX) * scale - 0.5;
      const sy = ((H[3] * u + H[4] * v + H[5]) / w - originY) * scale - 0.5;
      if (sx < -1 || sy < -1 || sx > sw || sy > sh) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 0;
      for (let k = 0; k < 4; k++) {
        const xx = x0 + (k & 1);
        const yy = y0 + (k >> 1);
        if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) continue;
        const wt = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
        const p = (yy * sw + xx) * 4;
        const pa = (data[p + 3] / 255) * wt;
        r += data[p] * pa;
        g += data[p + 1] * pa;
        bl += data[p + 2] * pa;
        a += pa;
      }
      if (a <= 0.0005) continue;
      out[o] = r / a;
      out[o + 1] = g / a;
      out[o + 2] = bl / a;
      out[o + 3] = a * 255;
      any = true;
    }
  }
  return any;
}
