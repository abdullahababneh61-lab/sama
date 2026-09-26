/**
 * Renders the main artboard (background + visible layers) into RGBA pixels,
 * for tools that analyse the picture: the Quick Selection tool's colour
 * flood fill and the Magnetic Lasso's edge detection.
 *
 * Like the Eyedropper, this is a clean render of the scene — guides,
 * selection outlines and tool overlays never show up in it.
 */
import type { FabricObject } from 'fabric';

export interface ScenePixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function renderArtboardPixels(
  objects: FabricObject[],
  doc: { width: number; height: number; background: string | null },
  width: number,
  height: number,
): ScenePixels {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  ctx.scale(width / doc.width, height / doc.height);
  if (doc.background) {
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  for (const obj of objects) {
    if (obj.visible) obj.render(ctx);
  }
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}
