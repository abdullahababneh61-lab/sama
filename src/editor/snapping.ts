/**
 * Snapping for object moves: to the artboard edges/centre, to guides and to
 * the edges/centres of other layers ("smart guides").
 */
import type { TBBox } from 'fabric';

export interface SnapLine {
  orientation: 'vertical' | 'horizontal';
  /** Position in artboard pixels. */
  value: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  lines: SnapLine[];
}

/**
 * Finds the smallest offset that aligns one of the moving box's left/centre/
 * right (and top/middle/bottom) edges with a candidate line.
 */
export function computeSnap(
  box: TBBox,
  candidatesX: number[],
  candidatesY: number[],
  threshold: number,
): SnapResult {
  const xs = [box.left, box.left + box.width / 2, box.left + box.width];
  const ys = [box.top, box.top + box.height / 2, box.top + box.height];

  const best = (edges: number[], candidates: number[]) => {
    let delta = Infinity;
    for (const edge of edges) {
      for (const c of candidates) {
        const d = c - edge;
        if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(delta)) delta = d;
      }
    }
    return Number.isFinite(delta) ? delta : 0;
  };

  const dx = best(xs, candidatesX);
  const dy = best(ys, candidatesY);
  const lines: SnapLine[] = [];
  const eps = 0.01;
  if (dx !== 0 || candidatesX.some((c) => xs.some((x) => Math.abs(x - c) < eps))) {
    for (const x of xs) {
      const v = x + dx;
      if (candidatesX.some((c) => Math.abs(c - v) < eps)) lines.push({ orientation: 'vertical', value: v });
    }
  }
  if (dy !== 0 || candidatesY.some((c) => ys.some((y) => Math.abs(y - c) < eps))) {
    for (const y of ys) {
      const v = y + dy;
      if (candidatesY.some((c) => Math.abs(c - v) < eps)) lines.push({ orientation: 'horizontal', value: v });
    }
  }
  return { dx, dy, lines };
}
