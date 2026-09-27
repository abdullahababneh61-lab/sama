/**
 * Pixel helpers behind "Cut to New Layer" / "Copy to New Layer"
 * (`Editor.layerViaSelection`), plus the off-screen rendering switch shared
 * with the pixel-analysing selection tools.
 *
 * The region selection is mapped into an image layer's own pixel grid through
 * the layer's full transform (position, scale, rotation, flips, groups), so
 * the selection's exact shape — soft (feathered) edges included — is applied
 * to the image's pixels, however the image is placed.
 */
import { util, type Canvas, type FabricImage, type TMat2D } from 'fabric';
import type { PixelSelection } from './pixelSelection';

/**
 * Runs `fn` with Fabric's off-screen culling disabled, so objects scrolled
 * out of view are still drawn by `obj.render()` (Fabric skips top-level
 * objects outside the viewport while `skipOffscreen` is on).
 */
export function withOffscreenRendering<T>(canvas: Canvas | undefined, fn: () => T): T {
  if (!canvas) return fn();
  const prev = canvas.skipOffscreen;
  canvas.skipOffscreen = false;
  try {
    return fn();
  } finally {
    canvas.skipOffscreen = prev;
  }
}

/** The selection as a canvas whose alpha is the selection amount (mask resolution). */
export function selectionAlphaCanvas(sel: PixelSelection): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = sel.width;
  el.height = sel.height;
  const ctx = el.getContext('2d')!;
  const img = ctx.createImageData(sel.width, sel.height);
  const m = sel.getMask();
  for (let i = 0; i < m.length; i++) img.data[i * 4 + 3] = m[i];
  ctx.putImageData(img, 0, 0);
  return el;
}

/**
 * The image layer's pixels with the selection applied:
 * - `keep`: only what's inside the selection (everything else transparent);
 * - `remove`: everything except what's inside the selection.
 * Returns a canvas the size of the image's source, or null when the result
 * would be empty (`keep`) or unchanged (`remove`).
 */
export function applySelectionToImage(
  img: FabricImage,
  selection: HTMLCanvasElement,
  scale: number,
  mode: 'keep' | 'remove',
): HTMLCanvasElement | null {
  const el = img.getElement() as HTMLImageElement | HTMLCanvasElement;
  const imgW = el instanceof HTMLImageElement ? el.naturalWidth || el.width : el.width;
  const imgH = el instanceof HTMLImageElement ? el.naturalHeight || el.height : el.height;
  if (!imgW || !imgH || !img.width || !img.height) return null;

  // Mask pixel → scene → image pixel (image-local coordinates are centred).
  const toPixels: TMat2D = util.multiplyTransformMatrices(
    [1, 0, 0, 1, img.width / 2 + (img.cropX ?? 0), img.height / 2 + (img.cropY ?? 0)],
    util.invertTransform(img.calcTransformMatrix()),
  );
  const m = util.multiplyTransformMatrices(toPixels, [1 / scale, 0, 0, 1 / scale, 0, 0]);

  // Where the selection lands in the image: the only region that can change.
  const corners = [
    [0, 0],
    [selection.width, 0],
    [0, selection.height],
    [selection.width, selection.height],
  ].map(([x, y]) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))));
  const x1 = Math.min(imgW, Math.ceil(Math.max(...corners.map((p) => p.x))));
  const y1 = Math.min(imgH, Math.ceil(Math.max(...corners.map((p) => p.y))));
  if (x1 <= x0 || y1 <= y0) return null; // the selection doesn't touch this image

  const out = document.createElement('canvas');
  out.width = imgW;
  out.height = imgH;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(el, 0, 0);
  const before = mode === 'remove' ? ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data : null;
  ctx.save();
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  // Nearest-neighbour sampling keeps a hard edge identical to the marching ants.
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = mode === 'keep' ? 'destination-in' : 'destination-out';
  ctx.drawImage(selection, 0, 0);
  ctx.restore();
  const after = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  if (mode === 'keep') {
    for (let i = 3; i < after.length; i += 4) if (after[i]) return out;
    return null; // nothing visible inside the selection
  }
  for (let i = 3; i < after.length; i += 4) if (before![i] !== after[i]) return out;
  return null;
}
