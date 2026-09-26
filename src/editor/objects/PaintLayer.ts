/**
 * PaintLayer — the brush tool's equivalent of a Photoshop pixel layer.
 *
 * Strokes painted while a paint layer is the active layer are added into it,
 * so a sketch made of hundreds of strokes shows up as one row in the layers
 * panel. Internally each stroke stays a separate `BrushStroke` path.
 *
 * Erasing uses erase2d's `'deep'` mode, which clips each stroke individually;
 * this is what lets you paint *over* an erased area again (the new stroke is
 * not affected by earlier erasing), just like painting on a pixel layer.
 */
import { classRegistry, Group } from 'fabric';
import { BrushStroke } from './BrushStroke';

export class PaintLayer extends Group {
  static type = 'PaintLayer';

  /** Soft strokes blur beyond their geometric bounds: pad the group cache. */
  _getCacheCanvasDimensions() {
    const dims = super._getCacheCanvasDimensions();
    let pad = 0;
    for (const obj of this._objects) {
      if (obj instanceof BrushStroke) pad = Math.max(pad, obj.getBlurRadius() * 3);
    }
    if (pad > 0) {
      dims.width += Math.ceil(pad * 2 * dims.zoomX);
      dims.height += Math.ceil(pad * 2 * dims.zoomY);
      dims.x += pad * 2 * dims.zoomX;
      dims.y += pad * 2 * dims.zoomY;
    }
    return dims;
  }
}

classRegistry.setClass(PaintLayer);
