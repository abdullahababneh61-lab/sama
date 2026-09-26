/**
 * Pixel (region) selection — the "marching ants" selection of the marquee,
 * lasso and quick-selection tools.
 *
 * Unlike object selection (which picks whole layers), a region selection is
 * an area of the artboard. It is stored as a bitmap mask with one byte per
 * artboard pixel (1 = selected), so shapes can be added and subtracted
 * freely and the outline is always the exact union.
 *
 * - The mask covers the artboard only: parts of a shape outside the artboard
 *   are ignored (like Photoshop, where a selection can't extend past the
 *   canvas).
 * - Very large artboards are stored at a reduced resolution (`scale` < 1) so
 *   the mask never exceeds `MAX_MASK_PIXELS`; the selection edge is then
 *   slightly coarser than one artboard pixel.
 * - A pixel belongs to a shape when its centre lies inside the shape (no
 *   anti-aliasing), which keeps selections crisp and deterministic.
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
export type CombineMode = 'replace' | 'add' | 'subtract';

/** Upper bound on mask size (4096² ≈ 16.7 M bytes). */
export const MAX_MASK_PIXELS = 4096 * 4096;

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

  /** A copy of the mask (all zeros when nothing is selected). */
  getMask(): Uint8Array {
    return this.mask ? this.mask.slice() : new Uint8Array(this.width * this.height);
  }

  /** Replaces the whole mask (e.g. after a quick-selection stroke). */
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

  /** Is the artboard point (scene coordinates) selected? */
  contains(x: number, y: number): boolean {
    if (!this.mask) return false;
    const i = Math.floor(x * this.scale);
    const j = Math.floor(y * this.scale);
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return false;
    return this.mask[j * this.width + i] === 1;
  }

  /** Adds, subtracts or replaces with a shape. */
  combine(shape: SelectionShape, mode: CombineMode) {
    this.combineMask(this.rasterize(shape), mode);
  }

  /** Adds, subtracts or replaces with a mask of the same size. */
  combineMask(shapeMask: Uint8Array, mode: CombineMode) {
    if (mode === 'replace') {
      this.mask = shapeMask;
    } else {
      const m = this.mask ?? new Uint8Array(this.width * this.height);
      if (mode === 'add') for (let i = 0; i < m.length; i++) m[i] |= shapeMask[i];
      else for (let i = 0; i < m.length; i++) if (shapeMask[i]) m[i] = 0;
      this.mask = m;
    }
    this.changed();
  }

  /** Selects everything that wasn't selected, and vice versa. */
  invert() {
    const m = this.getMask();
    for (let i = 0; i < m.length; i++) m[i] ^= 1;
    this.mask = m;
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

  /** Number of selected mask pixels. */
  get pixelCount(): number {
    if (!this.mask) return 0;
    let n = 0;
    for (let i = 0; i < this.mask.length; i++) n += this.mask[i];
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
    this.outlineCache = this.mask ? traceContours(this.mask, this.width, this.height, 1 / this.scale) : [];
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
): number {
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;
  const seed = (sy * w + sx) * 4;
  const r0 = rgba[seed];
  const g0 = rgba[seed + 1];
  const b0 = rgba[seed + 2];
  const a0 = rgba[seed + 3];
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
