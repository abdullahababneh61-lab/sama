/**
 * BrushStroke — a single brush stroke, kept as a vector path.
 *
 * Why vector? Keeping strokes as paths (instead of baking them into pixels)
 * preserves the learner's actual gestures for later AI evaluation, keeps the
 * document small, and lets strokes be recoloured, re-sized and undone
 * individually.
 *
 * Soft edges ("hardness" < 1) are rendered with a Canvas 2D blur filter. The
 * blur radius is expressed in document pixels and converted to device pixels
 * at render time so the stroke looks the same at every zoom level.
 */
import { classRegistry, Path } from 'fabric';

/** Converts hardness (0..1) + brush size into a render recipe. */
export function softness(size: number, hardness: number) {
  const h = Math.min(1, Math.max(0, hardness));
  return {
    /** Width of the solid core of the stroke. */
    coreWidth: size * (0.5 + 0.5 * h),
    /** Gaussian blur radius, in document pixels. */
    blur: (size * (1 - h)) / 6,
  };
}

/** Feature-detect `ctx.filter` once (Safari historically lacked it). */
const supportsCanvasFilter = (() => {
  if (typeof document === 'undefined') return false;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    return !!ctx && 'filter' in ctx;
  } catch {
    return false;
  }
})();

export class BrushStroke extends Path {
  static type = 'BrushStroke';

  /** Serialized alongside the standard Path properties. */
  static customProperties = ['samaHardness', 'samaBrushSize'];

  /** Include hardness in the cache key so changing it re-renders the cache. */
  static cacheProperties = [...Path.cacheProperties, 'samaHardness'];

  /** 0..1 */
  declare samaHardness: number;
  /** Nominal brush diameter the stroke was painted with. */
  declare samaBrushSize: number;

  /** Blur radius in document pixels (0 for hard brushes). */
  getBlurRadius() {
    const size = this.samaBrushSize ?? this.strokeWidth;
    return softness(size, this.samaHardness ?? 1).blur;
  }

  _render(ctx: CanvasRenderingContext2D) {
    const blur = this.getBlurRadius();
    if (blur > 0.01 && supportsCanvasFilter) {
      // The filter is applied in device space, so scale by the current
      // transform to keep softness constant across zoom levels.
      const m = ctx.getTransform();
      const scale = Math.sqrt(m.a * m.a + m.b * m.b) || 1;
      ctx.save();
      ctx.filter = `blur(${(blur * scale).toFixed(2)}px)`;
      super._render(ctx);
      ctx.restore();
    } else {
      super._render(ctx);
    }
  }

  /** Pad the object cache so the blurred edge is not clipped. */
  _getCacheCanvasDimensions() {
    const dims = super._getCacheCanvasDimensions();
    const pad = this.getBlurRadius() * 3;
    if (pad > 0) {
      dims.width += Math.ceil(pad * 2 * dims.zoomX);
      dims.height += Math.ceil(pad * 2 * dims.zoomY);
      dims.x += pad * 2 * dims.zoomX;
      dims.y += pad * 2 * dims.zoomY;
    }
    return dims;
  }
}

classRegistry.setClass(BrushStroke);
