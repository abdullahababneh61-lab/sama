/**
 * Edge detection and edge-following paths for the Magnetic Lasso.
 *
 * - `computeEdges` turns the rendered artboard into an edge-strength map
 *   (Sobel gradient of the luminance, 0..1).
 * - `snapToEdge` finds the strongest edge near a point (the lasso's "width").
 * - `liveWire` finds the path between two points that follows edges: a
 *   shortest path (Dijkstra) where crossing strong edges is cheap and flat
 *   areas are expensive — the "intelligent scissors" technique behind
 *   Photoshop's Magnetic Lasso. The search is limited to a window around the
 *   two points so it stays fast enough to run on every pointer move.
 *
 * Pure functions (no DOM), unit-tested directly. Coordinates are in edge-map
 * pixels; a point (x, y) refers to pixel (floor(x), floor(y)).
 */
import type { XY } from './pixelSelection';

export interface EdgeMap {
  width: number;
  height: number;
  /** Edge strength per pixel, 0 (flat) … 1 (strongest edge in the image). */
  strength: Float32Array;
}

/** Sobel edge strength of RGBA pixels (transparent pixels count as white). */
export function computeEdges(rgba: Uint8ClampedArray, width: number, height: number): EdgeMap {
  const n = width * height;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = rgba[p + 3] / 255;
    const y = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    lum[i] = y * a + 255 * (1 - a);
  }
  smooth3x3(lum, width, height);
  const strength = new Float32Array(n);
  let max = 0;
  for (let y = 0; y < height; y++) {
    // Rows above/below (clamped at the image border).
    const up = Math.max(0, y - 1) * width;
    const mid = y * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      const l = x > 0 ? x - 1 : 0;
      const r = x < width - 1 ? x + 1 : x;
      const gx = lum[up + r] + 2 * lum[mid + r] + lum[down + r] - lum[up + l] - 2 * lum[mid + l] - lum[down + l];
      const gy = lum[down + l] + 2 * lum[down + x] + lum[down + r] - lum[up + l] - 2 * lum[up + x] - lum[up + r];
      const g = Math.sqrt(gx * gx + gy * gy);
      strength[mid + x] = g;
      if (g > max) max = g;
    }
  }
  if (max > 0) for (let i = 0; i < n; i++) strength[i] /= max;
  return { width, height, strength };
}

/** In-place 3×3 box blur (edges clamped): keeps photo noise from reading as edges. */
function smooth3x3(v: Float32Array, w: number, h: number) {
  const tmp = new Float32Array(v.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) tmp[row + x] = (v[row + Math.max(0, x - 1)] + v[row + x] + v[row + Math.min(w - 1, x + 1)]) / 3;
  }
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w;
    const mid = y * w;
    const down = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) v[mid + x] = (tmp[up + x] + tmp[mid + x] + tmp[down + x]) / 3;
  }
}

/** Minimum edge strength that counts as "an edge" for snapping. */
const SNAP_THRESHOLD = 0.08;

/**
 * The strongest edge pixel within `radius` of (x, y), as a pixel centre.
 * Ties go to the nearer pixel. Returns the point itself (clamped) when
 * there's no edge nearby.
 */
export function snapToEdge(map: EdgeMap, x: number, y: number, radius: number): XY {
  const { width: w, height: h, strength } = map;
  const cx = Math.min(w - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(h - 1, Math.max(0, Math.floor(y)));
  const r = Math.max(0, Math.round(radius));
  let best = -1;
  let bx = cx;
  let by = cy;
  for (let j = Math.max(0, cy - r); j <= Math.min(h - 1, cy + r); j++) {
    for (let i = Math.max(0, cx - r); i <= Math.min(w - 1, cx + r); i++) {
      const d2 = (i - cx) ** 2 + (j - cy) ** 2;
      if (d2 > r * r) continue;
      const s = strength[j * w + i];
      if (s < SNAP_THRESHOLD) continue;
      // Prefer strong edges, then closeness.
      const score = s - Math.sqrt(d2) * 0.002;
      if (score > best) {
        best = score;
        bx = i;
        by = j;
      }
    }
  }
  return { x: bx + 0.5, y: by + 0.5 };
}

/** Largest search window (pixels) for one live-wire segment. */
export const MAX_WIRE_WINDOW = 360 * 360;

/**
 * Edge-following path from `from` to `to` (pixel centres, both included).
 * Falls back to a straight line when the window would be too large.
 */
export function liveWire(map: EdgeMap, from: XY, to: XY, margin = 12): XY[] {
  const { width: w, height: h, strength } = map;
  const fx = clampInt(from.x, w);
  const fy = clampInt(from.y, h);
  const tx = clampInt(to.x, w);
  const ty = clampInt(to.y, h);
  if (fx === tx && fy === ty) return [{ x: fx + 0.5, y: fy + 0.5 }];
  const x0 = Math.max(0, Math.min(fx, tx) - margin);
  const y0 = Math.max(0, Math.min(fy, ty) - margin);
  const x1 = Math.min(w - 1, Math.max(fx, tx) + margin);
  const y1 = Math.min(h - 1, Math.max(fy, ty) + margin);
  const ww = x1 - x0 + 1;
  const wh = y1 - y0 + 1;
  if (ww * wh > MAX_WIRE_WINDOW) return straightLine(fx, fy, tx, ty);

  const size = ww * wh;
  const dist = new Float32Array(size).fill(Infinity);
  const prev = new Int32Array(size).fill(-1);
  const done = new Uint8Array(size);
  const heap = new MinHeap();
  const start = (fy - y0) * ww + (fx - x0);
  const goal = (ty - y0) * ww + (tx - x0);
  dist[start] = 0;
  heap.push(start, 0);
  const DIAG = Math.SQRT2;
  while (heap.size) {
    const cur = heap.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === goal) break;
    const cx = cur % ww;
    const cy = (cur - cx) / ww;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= wh) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        if (nx < 0 || nx >= ww) continue;
        const ni = ny * ww + nx;
        if (done[ni]) continue;
        // Cheap along strong edges, expensive across flat areas.
        const s = strength[(ny + y0) * w + (nx + x0)];
        const step = (dx && dy ? DIAG : 1) * (1 - s + 0.02);
        const nd = dist[cur] + step;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          prev[ni] = cur;
          heap.push(ni, nd);
        }
      }
    }
  }
  if (prev[goal] < 0) return straightLine(fx, fy, tx, ty);
  const path: XY[] = [];
  for (let i = goal; i >= 0; i = i === start ? -1 : prev[i]) {
    const px = i % ww;
    path.push({ x: px + x0 + 0.5, y: (i - px) / ww + y0 + 0.5 });
  }
  return path.reverse();
}

function clampInt(v: number, size: number) {
  return Math.min(size - 1, Math.max(0, Math.floor(v)));
}

function straightLine(fx: number, fy: number, tx: number, ty: number): XY[] {
  const steps = Math.max(Math.abs(tx - fx), Math.abs(ty - fy), 1);
  const out: XY[] = [];
  for (let k = 0; k <= steps; k++) {
    out.push({ x: Math.round(fx + ((tx - fx) * k) / steps) + 0.5, y: Math.round(fy + ((ty - fy) * k) / steps) + 0.5 });
  }
  return out;
}

/** Length of a polyline. */
export function pathLength(points: XY[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/** Binary min-heap of (index, priority) pairs. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];

  get size() {
    return this.ids.length;
  }

  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }

  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
