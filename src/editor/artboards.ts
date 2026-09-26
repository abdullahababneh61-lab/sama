/**
 * Artboard helpers.
 *
 * A document always has one *main* artboard: the area described by the
 * document settings, at (0, 0) in scene coordinates. It is what PNG export
 * renders and what rulers, snapping and "fit to screen" refer to. The
 * Artboard tool can add more artboards anywhere on the pasteboard; they are
 * stored in `DocumentSettings.artboards` and take part in undo/redo and the
 * structured export.
 *
 * Pure functions, unit-tested directly.
 */
import type { ArtboardSettings, DocumentSettings } from './types';

/** Colour of the pasteboard (the canvas area around the artboards). */
export const PASTEBOARD_COLOR = '#1b1b1f';

/** Font of the artboard name labels drawn above each artboard. */
export const ARTBOARD_LABEL_FONT = '500 11px system-ui, -apple-system, "Segoe UI", sans-serif';

/** Id of the main artboard in `listArtboards` results. */
export const MAIN_ARTBOARD_ID = 'main';

export interface ArtboardRect {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every artboard, main first, in scene coordinates. */
export function listArtboards(doc: DocumentSettings): ArtboardRect[] {
  return [
    { id: MAIN_ARTBOARD_ID, name: doc.name, x: 0, y: 0, width: doc.width, height: doc.height },
    ...(doc.artboards ?? []).map((a) => ({ ...a })),
  ];
}

/** Stores a list (main first) back into document settings. Main must be at (0, 0). */
export function artboardsToDocument(doc: DocumentSettings, list: ArtboardRect[]): DocumentSettings {
  const [main, ...rest] = list;
  const next: DocumentSettings = { ...doc, name: main.name, width: main.width, height: main.height };
  const extra: ArtboardSettings[] = rest.map(({ id, name, x, y, width, height }) => ({ id, name, x, y, width, height }));
  if (extra.length) next.artboards = extra;
  else delete next.artboards;
  return next;
}

/** "Artboard N": N is the artboard count + 1, bumped until the name is unused. */
export function nextArtboardName(list: ArtboardRect[], label = 'Artboard'): string {
  const names = new Set(list.map((a) => a.name));
  let n = list.length + 1;
  while (names.has(`${label} ${n}`)) n++;
  return `${label} ${n}`;
}

/** Rounded rectangle spanning two points. */
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x0 = Math.round(Math.min(a.x, b.x));
  const y0 = Math.round(Math.min(a.y, b.y));
  const x1 = Math.round(Math.max(a.x, b.x));
  const y1 = Math.round(Math.max(a.y, b.y));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Top-most artboard (last in the list) containing the scene point. */
export function artboardAt(list: ArtboardRect[], x: number, y: number): ArtboardRect | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height) return a;
  }
  return null;
}

/**
 * Which artboard an object belongs to: the top-most artboard containing the
 * centre of its bounding box (Illustrator's rule), or null when it's on the
 * pasteboard.
 */
export function owningArtboard(
  list: ArtboardRect[],
  box: { left: number; top: number; width: number; height: number },
): ArtboardRect | null {
  return artboardAt(list, box.left + box.width / 2, box.top + box.height / 2);
}
