/**
 * One-time Fabric.js configuration shared by every workspace instance.
 *
 * - Declares the custom properties Sama stores on objects (so they are
 *   serialized by `toObject()` and survive undo/redo and export).
 * - Registers custom classes (BrushStroke, PaintLayer) and the eraser's
 *   ClippingGroup so documents can be deserialized.
 * - Sets the look of selection handles to match the workspace theme.
 */
import { config, FabricObject, InteractiveFabricObject } from 'fabric';
// Importing erase2d registers its `ClippingGroup` class with Fabric's registry.
import '@erase2d/fabric';
import './objects/BrushStroke';
import './objects/PaintLayer';
import type { LayerKind } from './types';

declare module 'fabric' {
  interface FabricObject {
    /** Stable unique id (survives undo/redo, export and reload). */
    samaId?: string;
    /** Display name shown in the layers panel. */
    samaName?: string;
    /** What kind of layer this object represents. */
    samaKind?: LayerKind;
    /** Locked layers cannot be selected or modified on the canvas. */
    samaLocked?: boolean;
    /** For images: id of the source asset in the asset registry. */
    samaAssetId?: string;
    /** For images: original file name. */
    samaFileName?: string;
    /** For polygons: number of sides (kept so it can be edited later). */
    samaSides?: number;
    /** Set by @erase2d/fabric: which objects the eraser affects. */
    erasable?: boolean | 'deep';
  }
}

/** Custom properties serialized with every object. */
export const SAMA_PROPERTIES = [
  'samaId',
  'samaName',
  'samaKind',
  'samaLocked',
  'samaAssetId',
  'samaFileName',
  'samaSides',
] as const;

/** Accent colour used for selection handles, matches `--sw-accent`. */
export const ACCENT = '#4d8dff';

let configured = false;

export function configureFabric() {
  if (configured) return;
  configured = true;

  FabricObject.customProperties = [...SAMA_PROPERTIES];

  // Allow larger object caches so big brush layers and images stay crisp when
  // zoomed in (Fabric's defaults are tuned for small/mobile canvases; this
  // workspace is desktop-only).
  config.configure({
    perfLimitSizeTotal: 4096 * 4096,
    maxCacheSideLimit: 8192,
  });

  // Selection handle styling (Figma/Illustrator-like: small white squares).
  Object.assign(InteractiveFabricObject.ownDefaults, {
    borderColor: ACCENT,
    cornerColor: '#ffffff',
    cornerStrokeColor: ACCENT,
    cornerStyle: 'rect',
    cornerSize: 8,
    touchCornerSize: 16,
    transparentCorners: false,
    borderScaleFactor: 1.5,
    padding: 0,
    borderOpacityWhenMoving: 0.6,
  });
}
