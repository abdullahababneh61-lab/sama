/**
 * Canvas cursors for the selecting tools. Each is an SVG drawn twice (a white
 * outline under a dark stroke) so it reads on light and dark artwork, with a
 * small badge for the selection mode: + add, − subtract, × intersect.
 */
import type { SelectionMode } from './types';

/** Draws `d` as a dark line with a white halo. */
const stroke = (d: string, width = 1.5) =>
  `<path d="${d}" stroke="#fff" stroke-width="${width + 2}" stroke-linecap="round"/><path d="${d}" stroke="#111" stroke-width="${width}" stroke-linecap="round"/>`;

const badge = (mode: SelectionMode, x: number, y: number) => {
  if (mode === 'new') return '';
  const d = {
    add: `M${x - 3} ${y}h6M${x} ${y - 3}v6`,
    subtract: `M${x - 3} ${y}h6`,
    intersect: `M${x - 2.5} ${y - 2.5}l5 5M${x + 2.5} ${y - 2.5}l-5 5`,
  }[mode];
  return stroke(d);
};

const cursor = (body: string, hx: number, hy: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">${body}</svg>`,
  )}") ${hx} ${hy}, crosshair`;

/** Crosshair (hotspot at its centre) with a mode badge — marquees, lassos, Object Selection. */
export function crosshairCursor(mode: SelectionMode): string {
  return cursor(stroke('M11 2v7M11 13v7M2 11h7M13 11h7', 1) + badge(mode, 19, 19), 11, 11);
}

/** Magic wand (hotspot at the wand's tip, top-left) with a mode badge. */
export function wandCursor(mode: SelectionMode): string {
  return cursor(stroke('M4 4l14 14M4 1v2M1 4h2M7 2l-1 1M2 7l1-1') + badge(mode, 19, 8), 4, 4);
}

/** Hollow arrow with a + (Illustrator's Group Selection cursor); hotspot at the tip. */
export function groupSelectCursor(): string {
  const arrow = 'M4 2v15l4-4 3 6 2-1-3-6h5z';
  return cursor(
    `<path d="${arrow}" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>` + badge('add', 19, 19),
    4,
    2,
  ).replace(', crosshair', ', default');
}
