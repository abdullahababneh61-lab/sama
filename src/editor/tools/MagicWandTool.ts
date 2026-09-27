/**
 * Magic Wand tool (Y): click to select an area of similar colour (marching
 * ants), like Photoshop's Magic Wand.
 *
 * - Works on the visible picture — shapes, text, paint and photos alike —
 *   so clicking a solid shape selects exactly that shape's pixels, and
 *   clicking the empty artboard selects the background around the artwork.
 * - Tolerance (0–255, default 32 — Photoshop's default): how far each
 *   channel (red, green, blue, alpha) may differ from the clicked colour.
 * - Contiguous (on by default): only pixels connected to the clicked one.
 *   Off: every pixel of a similar colour on the artboard.
 * - Mode (options bar): New, Add, Subtract or Intersect. Keys held on the
 *   click override it: Shift = add, Alt/Option = subtract, Shift+Alt =
 *   intersect. The cursor shows the mode (+ / − / × next to the wand).
 * - Each click is one undo step ("Magic Wand"); the selection's size
 *   flashes next to it. A click outside the artboard deselects (New mode).
 *   Esc clears the selection.
 *
 * The result is the shared region selection used by the marquees, lassos
 * and Quick Selection, so Feather, Invert, Cut/Copy to New Layer etc. all
 * apply to it.
 */
import { RegionTool } from './RegionTool';
import type { ToolPointerEvent } from './Tool';
import { floodFill } from '../pixelSelection';
import { wandCursor } from '../cursors';
import type { SelectionMode } from '../types';

/**
 * The pixels selected by a click at (x, y) (mask coordinates), as a 0/255
 * mask: similar pixels connected to the clicked one (`contiguous`), or all
 * similar pixels. Null when the click is outside the image.
 */
export function magicWandMask(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  tolerance: number,
  contiguous: boolean,
): Uint8Array | null {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const out = new Uint8Array(w * h);
  if (contiguous) {
    floodFill(rgba, w, h, sx, sy, tolerance, out);
  } else {
    const s = (sy * w + sx) * 4;
    const [r, g, b, a] = [rgba[s], rgba[s + 1], rgba[s + 2], rgba[s + 3]];
    for (let i = 0, p = 0; i < out.length; i++, p += 4) {
      if (
        Math.abs(rgba[p] - r) <= tolerance &&
        Math.abs(rgba[p + 1] - g) <= tolerance &&
        Math.abs(rgba[p + 2] - b) <= tolerance &&
        Math.abs(rgba[p + 3] - a) <= tolerance
      ) {
        out[i] = 1;
      }
    }
  }
  for (let i = 0; i < out.length; i++) if (out[i]) out[i] = 255;
  antiAliasEdge(rgba, w, h, sx, sy, out);
  return out;
}

/**
 * Anti-aliasing (like Photoshop's option, always on): shapes are drawn with
 * soft edges, so the pixels just outside the selected area are partly the
 * clicked colour. Each gets a partial selection value — how much of it the
 * clicked colour covers, estimated from where its colour lies between the
 * clicked colour and the colour just beyond it. The marching ants (drawn at
 * 50 %) then follow the shape's true edge instead of running a pixel inside.
 */
function antiAliasEdge(rgba: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, mask: Uint8Array) {
  const s = (sy * w + sx) * 4;
  const seed = [rgba[s], rgba[s + 1], rgba[s + 2], rgba[s + 3]];
  const dist = (i: number) => {
    const p = i * 4;
    return Math.hypot(rgba[p] - seed[0], rgba[p + 1] - seed[1], rgba[p + 2] - seed[2], rgba[p + 3] - seed[3]);
  };
  const edge: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) continue;
      let cover = 0;
      // A selected neighbour on one side, the other colour on the opposite side.
      const check = (inside: number, beyond: number) => {
        if (mask[inside] !== 255 || mask[beyond]) return;
        const far = dist(beyond);
        if (far < 1) return;
        cover = Math.max(cover, 1 - dist(i) / far);
      };
      if (x > 0 && x < w - 1) {
        check(i - 1, i + 1);
        check(i + 1, i - 1);
      }
      if (y > 0 && y < h - 1) {
        check(i - w, i + w);
        check(i + w, i - w);
      }
      if (cover > 0.02) edge.push([i, Math.round(Math.min(1, cover) * 254)]);
    }
  }
  for (const [i, v] of edge) mask[i] = v;
}

export class MagicWandTool extends RegionTool {
  readonly id = 'magicWand' as const;
  cursor = wandCursor('new');

  protected get historyLabel() {
    return 'Magic Wand';
  }

  /** Each click completes at once: there's never a selection in progress. */
  protected get busy() {
    return false;
  }

  protected cancel() {}

  protected cursorFor(mode: SelectionMode): string {
    return wandCursor(mode);
  }

  onPointerDown(ev: ToolPointerEvent) {
    const mode = this.modeFor(ev);
    const sel = this.editor.pixelSelection;
    const pixels = this.editor.renderArtboardPixels(); // also fits the mask to the artboard
    const { tolerance, contiguous } = this.editor.toolOptions.magicWand;
    const mask = magicWandMask(pixels.data, sel.width, sel.height, ev.scenePoint.x * sel.scale, ev.scenePoint.y * sel.scale, tolerance, contiguous);
    if (!mask) {
      this.clickWithoutShape(mode);
      return;
    }
    sel.combineMask(mask, mode);
    this.editor.publishPixelSelection();
    this.editor.commit(this.historyLabel);
    this.flashSize();
  }
}
