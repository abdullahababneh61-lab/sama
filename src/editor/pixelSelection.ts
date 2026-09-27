/**
 * Pixel (region) selection — the "marching ants" selection of the marquee,
 * lasso and quick-selection tools.
 *
 * Unlike object selection (which picks whole layers), a region selection is
 * an area of the artboard. It is stored as a mask with one byte per artboard
 * pixel: how selected the pixel is, 0 (not) … 255 (fully). Hard-edged tools
 * produce only 0 and 255; Feather creates the values in between (a soft
 * edge). Shapes combine freely (add = the higher value, subtract = remove),
 * and the outline is always the exact union.
 *
 * Everything that uses the selection reads this one mask: the marching ants
 * (drawn where the mask crosses 50 %, like Photoshop), the size readout,
 * Invert, Cut/Copy to New Layer, and the refinements
 * (Feather, Smooth, Expand, Contract) that rewrite it.
 *
 * - The mask covers the artboard only: parts of a shape outside the artboard
 *   are ignored (like Photoshop, where a selection can't extend past the
 *   canvas).
 * - Very large artboards are stored at a reduced resolution (`scale` < 1) so
 *   the mask never exceeds `MAX_MASK_PIXELS`; the selection edge is then
 *   slightly coarser than one artboard pixel.
 * - A pixel belongs to a shape when its centre lies inside the shape (no
 *   anti-aliasing), which keeps selections crisp and deterministic.
 * - "Selected" (for `contains`, `pixelCount` and the outline) means at least
 *   50 % selected; the bounding box includes every partly selected pixel.
 *
 * This module is pure (no DOM), so it's unit-tested directly.
 */

export interface XY {
  x: number;
  y: number;
}

/** A selection shape in artboard (scene) coordinates. */
export type SelectionShape =
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { type: 'polygon'; points: XY[] };

/** How a new shape combines with the existing selection. */
export type CombineMode = 'replace' | 'add' | 'subtract' | 'intersect';

/** Upper bound on mask size (4096² ≈ 16.7 M bytes). */
export const MAX_MASK_PIXELS = 4096 * 4096;

/** A run-length encoded selection mask (see `PixelSelection.encode`). */
export interface EncodedSelection {
  width: number;
  height: number;
  /** Pairs of (run length, value). */
  runs: Uint32Array;
}

/** Run-length encodes a byte mask as (length, value) pairs. */
export function encodeRuns(mask: Uint8Array): Uint32Array {
  const out: number[] = [];
  let i = 0;
  while (i < mask.length) {
    const v = mask[i];
    let j = i + 1;
    while (j < mask.length && mask[j] === v) j++;
    out.push(j - i, v);
    i = j;
  }
  return Uint32Array.from(out);
}

export function decodeRuns(runs: Uint32Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let i = 0;
  for (let k = 0; k < runs.length; k += 2) {
    out.fill(runs[k + 1], i, i + runs[k]);
    i += runs[k];
  }
  return out;
}

/** Equal encoded selections (null = no selection). */
export function sameSelection(a: EncodedSelection | null | undefined, b: EncodedSelection | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a === b) return true;
  if (a.width !== b.width || a.height !== b.height || a.runs.length !== b.runs.length) return false;
  for (let i = 0; i < a.runs.length; i++) if (a.runs[i] !== b.runs[i]) return false;
  return true;
}

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class PixelSelection {
  /** Mask size in mask pixels. */
  width = 0;
  height = 0;
  /** Mask pixels per artboard pixel (1 unless the artboard is huge). */
  scale = 1;
  /** Artboard size the mask was created for. */
  private docWidth = 0;
  private docHeight = 0;
  private mask: Uint8Array | null = null;
  private outlineCache: Float32Array[] | null = null;
  private boundsCache: SelectionBounds | null | undefined = undefined;
  /** Bumped on every change (lets callers cheaply detect updates). */
  version = 0;

  /** Makes the mask match the artboard size; a size change clears the selection. */
  fit(docWidth: number, docHeight: number) {
    if (docWidth === this.docWidth && docHeight === this.docHeight) return;
    this.docWidth = docWidth;
    this.docHeight = docHeight;
    this.scale = Math.min(1, Math.sqrt(MAX_MASK_PIXELS / Math.max(1, docWidth * docHeight)));
    this.width = Math.max(1, Math.round(docWidth * this.scale));
    this.height = Math.max(1, Math.round(docHeight * this.scale));
    this.mask = null;
    this.changed();
  }

  get isEmpty(): boolean {
    return this.bounds() === null;
  }

  /** A copy of the mask, values 0–255 (all zeros when nothing is selected). */
  getMask(): Uint8Array {
    return this.mask ? this.mask.slice() : new Uint8Array(this.width * this.height);
  }

  /** Replaces the whole mask (values 0–255), e.g. after a quick-selection stroke. */
  setMask(mask: Uint8Array) {
    if (mask.length !== this.width * this.height) throw new Error('Mask size mismatch');
    this.mask = mask;
    this.changed();
  }

  clear() {
    if (!this.mask) return;
    this.mask = null;
    this.changed();
  }

  private encodedCache: { version: number; value: EncodedSelection | null } | null = null;

  /**
   * A compact, immutable copy of the selection (run-length encoded), for the
   * undo history. Selections are mostly long runs of 0 or 255, so this is
   * typically a few kilobytes. Cached until the selection changes.
   */
  encode(): EncodedSelection | null {
    if (this.encodedCache?.version === this.version) return this.encodedCache.value;
    const value = this.isEmpty ? null : { width: this.width, height: this.height, runs: encodeRuns(this.mask!) };
    this.encodedCache = { version: this.version, value };
    return value;
  }

  /** Restores a selection produced by `encode()` (ignored if the mask size no longer matches). */
  restore(encoded: EncodedSelection | null) {
    if (!encoded) return this.clear();
    if (encoded.width !== this.width || encoded.height !== this.height) return this.clear();
    this.mask = decodeRuns(encoded.runs, this.width * this.height);
    this.changed();
  }

  /** Is the artboard point (scene coordinates) selected? */
  contains(x: number, y: number): boolean {
    if (!this.mask) return false;
    const i = Math.floor(x * this.scale);
    const j = Math.floor(y * this.scale);
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return false;
    return this.mask[j * this.width + i] >= 128;
  }

  /** Adds, subtracts or replaces with a shape. */
  combine(shape: SelectionShape, mode: CombineMode) {
    const m = this.rasterize(shape);
    for (let i = 0; i < m.length; i++) if (m[i]) m[i] = 255;
    this.combineMask(m, mode);
  }

  /** Adds, subtracts or replaces with a mask (values 0–255) of the same size. */
  combineMask(shapeMask: Uint8Array, mode: CombineMode) {
    if (mode === 'replace') {
      this.mask = shapeMask;
    } else {
      const m = this.mask ?? new Uint8Array(this.width * this.height);
      if (mode === 'add') for (let i = 0; i < m.length; i++) m[i] = Math.max(m[i], shapeMask[i]);
      else if (mode === 'subtract') for (let i = 0; i < m.length; i++) m[i] = Math.min(m[i], 255 - shapeMask[i]);
      else for (let i = 0; i < m.length; i++) m[i] = Math.min(m[i], shapeMask[i]); // intersect
      this.mask = m;
    }
    this.changed();
  }

  /** Selects everything that wasn't selected, and vice versa (soft edges stay soft). */
  invert() {
    const m = this.getMask();
    for (let i = 0; i < m.length; i++) m[i] = 255 - m[i];
    this.mask = m;
    this.changed();
  }

  // ---------------------------------------------------------------------------
  // Refinements (amounts in artboard pixels). Expand, Contract and Smooth
  // work on the 50 % outline and give a hard edge; Feather softens it.

  /** Softens the edge: a blur of the mask with the given radius. */
  feather(radius: number) {
    if (!this.mask || radius <= 0) return;
    const sigma = (radius * this.scale) / 2;
    // Three box blurs ≈ a Gaussian with that sigma.
    const box = Math.max(1, Math.round((Math.sqrt(1 + 4 * sigma * sigma) - 1) / 2));
    this.setRefined(blurMask(this.mask, this.width, this.height, box, 3));
  }

  /** Rounds off jagged bits, specks and small holes smaller than `radius`. */
  smooth(radius: number) {
    if (!this.mask || radius <= 0) return;
    this.setRefined(majorityFilter(this.mask, this.width, this.height, Math.max(1, Math.round(radius * this.scale))));
  }

  /** Grows the selection outward by `amount`. */
  expand(amount: number) {
    if (!this.mask || amount <= 0) return;
    const n = amount * this.scale;
    const d = distanceToSelected(this.mask, this.width, this.height, true);
    const out = new Uint8Array(this.mask.length);
    for (let i = 0; i < out.length; i++) out[i] = d[i] <= n * n ? 255 : 0;
    this.setRefined(out);
  }

  /**
   * Shrinks the selection inward by `amount`. Edges lying on the artboard's
   * border don't move (Photoshop's default).
   */
  contract(amount: number) {
    if (!this.mask || amount <= 0) return;
    const n = amount * this.scale;
    const d = distanceToSelected(this.mask, this.width, this.height, false);
    const out = new Uint8Array(this.mask.length);
    for (let i = 0; i < out.length; i++) out[i] = this.mask[i] >= 128 && d[i] > n * n ? 255 : 0;
    this.setRefined(out);
  }

  private setRefined(mask: Uint8Array) {
    this.mask = mask.some((v) => v > 0) ? mask : null;
    this.changed();
  }

  /** Bounding box of the selection in artboard pixels, or null when empty. */
  bounds(): SelectionBounds | null {
    if (this.boundsCache !== undefined) return this.boundsCache;
    const m = this.mask;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    if (m) {
      const w = this.width;
      for (let j = 0; j < this.height; j++) {
        const row = j * w;
        let first = -1;
        for (let i = 0; i < w; i++) {
          if (m[row + i]) {
            first = i;
            break;
          }
        }
        if (first < 0) continue;
        let last = first;
        for (let i = w - 1; i > first; i--) {
          if (m[row + i]) {
            last = i;
            break;
          }
        }
        if (first < minX) minX = first;
        if (last > maxX) maxX = last;
        if (j < minY) minY = j;
        maxY = j;
      }
    }
    const s = this.scale;
    this.boundsCache =
      maxX < 0
        ? null
        : { x: minX / s, y: minY / s, width: (maxX - minX + 1) / s, height: (maxY - minY + 1) / s };
    return this.boundsCache;
  }

  /** Number of (at least 50 %) selected mask pixels. */
  get pixelCount(): number {
    if (!this.mask) return 0;
    let n = 0;
    for (let i = 0; i < this.mask.length; i++) if (this.mask[i] >= 128) n++;
    return n;
  }

  /**
   * The selection's outline as closed loops, each `[x0, y0, x1, y1, …]` in
   * artboard coordinates: the boundary between selected and unselected
   * pixels, traced into continuous contours (so marching-ants dashes flow
   * around each shape) with straight runs merged into single segments.
   * Holes and separate islands each get their own loop, like Photoshop.
   */
  outline(): Float32Array[] {
    if (this.outlineCache) return this.outlineCache;
    this.outlineCache = this.mask ? traceContours(threshold(this.mask), this.width, this.height, 1 / this.scale) : [];
    return this.outlineCache;
  }

  /** Rasterizes a shape (artboard coordinates) into a mask of this selection's size. */
  rasterize(shape: SelectionShape): Uint8Array {
    const s = this.scale;
    if (shape.type === 'rect') return rasterizeRect(this.width, this.height, shape.x * s, shape.y * s, shape.w * s, shape.h * s);
    if (shape.type === 'ellipse')
      return rasterizeEllipse(this.width, this.height, shape.cx * s, shape.cy * s, shape.rx * s, shape.ry * s);
    return rasterizePolygon(
      this.width,
      this.height,
      shape.points.map((p) => ({ x: p.x * s, y: p.y * s })),
    );
  }

  private changed() {
    this.outlineCache = null;
    this.boundsCache = undefined;
    this.version++;
  }
}

/** 1 where the mask is at least 50 % selected, else 0. */
export function threshold(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] >= 128 ? 1 : 0;
  return out;
}

/** `passes` separable box blurs of radius `box` (edges extended, so borders don't fade). */
export function blurMask(mask: Uint8Array, w: number, h: number, box: number, passes: number): Uint8Array {
  const a = Float32Array.from(mask);
  const b = new Float32Array(a.length);
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    const lines = horizontal ? h : w;
    const len = horizontal ? w : h;
    const step = horizontal ? 1 : w;
    const k = 2 * box + 1;
    for (let l = 0; l < lines; l++) {
      const base = horizontal ? l * w : l;
      const at = (i: number) => src[base + Math.min(len - 1, Math.max(0, i)) * step];
      let sum = 0;
      for (let i = -box; i <= box; i++) sum += at(i);
      for (let i = 0; i < len; i++) {
        dst[base + i * step] = sum / k;
        sum += at(i + box + 1) - at(i - box);
      }
    }
  };
  for (let p = 0; p < passes; p++) {
    pass(a, b, true);
    pass(b, a, false);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.min(255, Math.max(0, a[i])));
  return out;
}

/** Each pixel becomes selected when most of the (2r+1)² window around it is (ties keep it as is). */
export function majorityFilter(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // Summed-area table of the 50 % selection.
  const sat = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x] >= 128 ? 1 : 0;
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const count = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      const area = (x1 - x0) * (y1 - y0);
      const self = mask[y * w + x] >= 128;
      out[y * w + x] = 2 * count > area || (2 * count === area && self) ? 255 : 0;
    }
  }
  return out;
}

/**
 * Squared Euclidean distance from every pixel to the nearest selected pixel
 * (`toSelected`) or to the nearest unselected pixel (otherwise), at the
 * 50 % threshold. Exact distance transform (Felzenszwalb & Huttenlocher).
 */
export function distanceToSelected(mask: Uint8Array, w: number, h: number, toSelected: boolean): Float64Array {
  const INF = 1e20;
  const d = new Float64Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = (mask[i] >= 128) === toSelected ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const line = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = d[y * w + x];
    line(h);
    for (let y = 0; y < h; y++) d[y * w + x] = out[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = d[y * w + x];
    line(w);
    for (let x = 0; x < w; x++) d[y * w + x] = out[x];
  }
  return d;
}

/**
 * Traces the boundary of a binary mask into closed loops (vertex coordinates
 * multiplied by `unit`). Every selected pixel contributes its sides that face
 * an unselected pixel, oriented clockwise around the selection; following
 * those directed edges from vertex to vertex closes each loop.
 */
export function traceContours(m: Uint8Array, w: number, h: number, unit = 1): Float32Array[] {
  const W = w + 1;
  // A vertex has one outgoing edge, or two where selections touch diagonally.
  const next = new Map<number, number>();
  const next2 = new Map<number, number>();
  const add = (a: number, b: number) => {
    if (next.has(a)) next2.set(a, b);
    else next.set(a, b);
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!m[j * w + i]) continue;
      if (j === 0 || !m[(j - 1) * w + i]) add(j * W + i, j * W + i + 1); // top
      if (i === w - 1 || !m[j * w + i + 1]) add(j * W + i + 1, (j + 1) * W + i + 1); // right
      if (j === h - 1 || !m[(j + 1) * w + i]) add((j + 1) * W + i + 1, (j + 1) * W + i); // bottom
      if (i === 0 || !m[j * w + i - 1]) add((j + 1) * W + i, j * W + i); // left
    }
  }
  const take = (v: number): number => {
    const b2 = next2.get(v);
    if (b2 !== undefined) {
      next2.delete(v);
      return b2;
    }
    const b = next.get(v)!;
    next.delete(v);
    return b;
  };
  const loops: Float32Array[] = [];
  for (const start of next.keys()) {
    while (next.has(start)) {
      const pts: number[] = [];
      let cur = start;
      let dx = 0;
      let dy = 0;
      do {
        const nxt = take(cur);
        const ndx = (nxt % W) - (cur % W);
        const ndy = Math.floor(nxt / W) - Math.floor(cur / W);
        // Merge straight runs: only keep vertices where the direction changes.
        if (ndx !== dx || ndy !== dy) pts.push((cur % W) * unit, Math.floor(cur / W) * unit);
        dx = ndx;
        dy = ndy;
        cur = nxt;
      } while (cur !== start && next.has(cur));
      loops.push(new Float32Array(pts));
    }
  }
  return loops;
}

// ---------------------------------------------------------------------------
// Rasterizers: a mask pixel (i, j) is inside when its centre (i+½, j+½) is.

export function rasterizeRect(w: number, h: number, x: number, y: number, rw: number, rh: number): Uint8Array {
  const m = new Uint8Array(w * h);
  const x0 = Math.max(0, Math.ceil(Math.min(x, x + rw) - 0.5));
  const x1 = Math.min(w, Math.ceil(Math.max(x, x + rw) - 0.5));
  const y0 = Math.max(0, Math.ceil(Math.min(y, y + rh) - 0.5));
  const y1 = Math.min(h, Math.ceil(Math.max(y, y + rh) - 0.5));
  for (let j = y0; j < y1; j++) m.fill(1, j * w + x0, j * w + Math.max(x0, x1));
  return m;
}

export function rasterizeEllipse(w: number, h: number, cx: number, cy: number, rx: number, ry: number): Uint8Array {
  const m = new Uint8Array(w * h);
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx <= 0 || ry <= 0) return m;
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(h - 1, Math.ceil(cy + ry));
  for (let j = y0; j <= y1; j++) {
    const dy = (j + 0.5 - cy) / ry;
    const t = 1 - dy * dy;
    if (t < 0) continue;
    const half = rx * Math.sqrt(t);
    const a = Math.max(0, Math.ceil(cx - half - 0.5));
    const b = Math.min(w, Math.floor(cx + half - 0.5) + 1);
    if (b > a) m.fill(1, j * w + a, j * w + b);
  }
  return m;
}

/** Scanline fill with the non-zero winding rule (self-crossing lassos fill solidly). */
export function rasterizePolygon(w: number, h: number, pts: XY[]): Uint8Array {
  const m = new Uint8Array(w * h);
  const n = pts.length;
  if (n < 3) return m;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const j0 = Math.max(0, Math.floor(minY));
  const j1 = Math.min(h - 1, Math.ceil(maxY));
  const xs: number[] = [];
  const dirs: number[] = [];
  const order: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const yc = j + 0.5;
    xs.length = dirs.length = order.length = 0;
    for (let k = 0; k < n; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % n];
      if (a.y === b.y) continue;
      const up = a.y < b.y;
      const lo = up ? a : b;
      const hi = up ? b : a;
      // Half-open rule: include the lower end, exclude the upper end.
      if (yc < lo.y || yc >= hi.y) continue;
      xs.push(lo.x + ((yc - lo.y) / (hi.y - lo.y)) * (hi.x - lo.x));
      dirs.push(up ? 1 : -1);
      order.push(order.length);
    }
    if (xs.length < 2) continue;
    order.sort((p, q) => xs[p] - xs[q]);
    let winding = 0;
    for (let k = 0; k < order.length - 1; k++) {
      winding += dirs[order[k]];
      if (winding === 0) continue;
      const a = Math.max(0, Math.ceil(xs[order[k]] - 0.5));
      const b = Math.min(w, Math.ceil(xs[order[k + 1]] - 0.5));
      if (b > a) m.fill(1, j * w + a, j * w + b);
    }
  }
  return m;
}

/** Average RGBA of the (2r+1)² pixels around (x, y), clamped to the image — a noise-robust sample. */
export function averageColor(rgba: Uint8ClampedArray, w: number, h: number, x: number, y: number, r: number): [number, number, number, number] {
  const sum = [0, 0, 0, 0];
  let n = 0;
  for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) {
    for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) {
      const p = (j * w + i) * 4;
      for (let c = 0; c < 4; c++) sum[c] += rgba[p + c];
      n++;
    }
  }
  return sum.map((v) => v / Math.max(1, n)) as [number, number, number, number];
}

/** Stamps a filled circle into `mask` (mask coordinates). */
export function stampCircle(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, value: 0 | 1 = 1) {
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let j = y0; j <= y1; j++) {
    const dy = j + 0.5 - cy;
    const t = r * r - dy * dy;
    if (t < 0) continue;
    const half = Math.sqrt(t);
    const a = Math.max(0, Math.ceil(cx - half - 0.5));
    const b = Math.min(w, Math.floor(cx + half - 0.5) + 1);
    if (b > a) mask.fill(value, j * w + a, j * w + b);
  }
}

/**
 * Contiguous flood fill over RGBA pixels: marks in `out` every pixel
 * connected to (sx, sy) whose colour differs from the seed colour by at most
 * `tolerance` in every channel (0–255, like Photoshop's Tolerance).
 * Returns the number of pixels newly marked.
 */
export function floodFill(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  tolerance: number,
  out: Uint8Array,
  /** Colour to compare with (RGBA); defaults to the start pixel's colour. */
  seedColor?: [number, number, number, number],
): number {
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;
  const seed = (sy * w + sx) * 4;
  const [r0, g0, b0, a0] = seedColor ?? [rgba[seed], rgba[seed + 1], rgba[seed + 2], rgba[seed + 3]];
  const visited = new Uint8Array(w * h);
  const similar = (i: number) => {
    const p = i * 4;
    return (
      Math.abs(rgba[p] - r0) <= tolerance &&
      Math.abs(rgba[p + 1] - g0) <= tolerance &&
      Math.abs(rgba[p + 2] - b0) <= tolerance &&
      Math.abs(rgba[p + 3] - a0) <= tolerance
    );
  };
  let added = 0;
  const stack = [sy * w + sx];
  visited[sy * w + sx] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    if (!similar(i)) continue;
    if (!out[i]) {
      out[i] = 1;
      added++;
    }
    const x = i % w;
    if (x > 0 && !visited[i - 1]) (visited[i - 1] = 1), stack.push(i - 1);
    if (x < w - 1 && !visited[i + 1]) (visited[i + 1] = 1), stack.push(i + 1);
    if (i >= w && !visited[i - w]) (visited[i - w] = 1), stack.push(i - w);
    if (i < w * (h - 1) && !visited[i + w]) (visited[i + w] = 1), stack.push(i + w);
  }
  return added;
}
