/**
 * Document serialization and export.
 *
 * Two representations are produced for every document:
 *
 * 1. `fabric` — the exact scene graph (Fabric's own JSON). This is what the
 *    workspace uses to reload a document with perfect fidelity.
 * 2. `layers` — a clean, tool-agnostic description of every layer (type,
 *    bounds, colours, text content, fonts, path data, image metadata…) plus a
 *    small `analysis` block. This is the part meant for a later AI evaluation
 *    step: it can be read without knowing anything about Fabric.
 */
import { FabricImage, Group, IText, Path, Point, Polygon, Rect, StaticCanvas, util } from 'fabric';
import type { Canvas, FabricObject } from 'fabric';
import { ClippingGroup } from '@erase2d/fabric';
import type { SerializedAsset } from './assets';
import { inferKind, layerChildren } from './meta';
import { BrushStroke } from './objects/BrushStroke';
import { PaintLayer } from './objects/PaintLayer';
import type { BlendMode, DocumentSettings, Guides, LayerKind } from './types';

export const DOCUMENT_FORMAT = 'sama.design-document';
export const DOCUMENT_VERSION = 1;
export const WORKSPACE_VERSION = '0.1.0';

/** Structured, exportable document (see docs/DOCUMENT_FORMAT.md). */
export interface SamaDocument {
  format: typeof DOCUMENT_FORMAT;
  version: typeof DOCUMENT_VERSION;
  generator: string;
  exportedAt: string;
  document: DocumentSettings & { units: 'px' };
  guides: Guides;
  /** Semantic layer tree, top-most layer first (same order as the layers panel). */
  layers: SemanticLayer[];
  analysis: DocumentAnalysis;
  /** Images referenced by layers, embedded once as data URLs. */
  assets: Record<string, SerializedAsset>;
  /** Exact scene graph for lossless reload (bottom-most object first). */
  fabric: { version: string; objects: Record<string, unknown>[] };
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SemanticLayer {
  id: string;
  name: string;
  type: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** Axis-aligned bounding box in artboard pixels (includes rotation). */
  bounds: Bounds;
  /** Unrotated size and rotation (degrees, clockwise). */
  transform: { width: number; height: number; rotation: number; flipX: boolean; flipY: boolean };
  /** How much of the layer lies inside the artboard, 0..1. */
  visibleFraction: number;
  /** True when part of this layer was removed with the eraser. */
  erased: boolean;
  style?: { fill: string | null; stroke: string | null; strokeWidth: number };
  shape?: { cornerRadius?: number; sides?: number };
  text?: {
    content: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number | string;
    fontStyle: string;
    textAlign: string;
    direction: string;
    lineHeight: number;
    letterSpacing: number;
    color: string | null;
    /** True for fixed-width paragraph text, false for point text. */
    wrapped: boolean;
  };
  path?: { d: string; closed: boolean; anchorCount: number };
  image?: { assetId?: string; fileName?: string; naturalWidth: number; naturalHeight: number };
  paint?: {
    strokeCount: number;
    colors: string[];
    brushSizes: number[];
    /** Every stroke's centre line in artboard coordinates, in painting order. */
    strokes: { d: string; color: string | null; size: number; opacity: number; hardness: number; erased: boolean }[];
  };
  children?: SemanticLayer[];
}

export interface DocumentAnalysis {
  layerCount: number;
  layerCountByType: Partial<Record<LayerKind, number>>;
  /** Distinct colours used (fills, strokes, text, brush), most used first. */
  colors: { color: string; uses: number }[];
  fonts: { family: string; weights: (number | string)[] }[];
  /** Ids of layers that extend beyond the artboard. */
  layersOutsideArtboard: string[];
  /** Ids of hidden layers (they are not in the PNG). */
  hiddenLayers: string[];
  textContent: string[];
}

// ---------------------------------------------------------------------------
// Scene serialization
// ---------------------------------------------------------------------------

/**
 * Serializes one top-level object in canvas coordinates, even when it is
 * currently part of a multi-selection (whose transform must be baked in).
 */
export function serializeObject(canvas: Canvas, obj: FabricObject): Record<string, unknown> {
  // `_toObject` on the interactive canvas temporarily realizes the active
  // selection's transform on the object; it is protected in Fabric's types.
  return (canvas as unknown as { _toObject: (o: FabricObject, m: string, p: string[]) => Record<string, unknown> })._toObject(
    obj,
    'toObject',
    [],
  );
}

/** Re-creates Fabric objects from serialized JSON. */
export function enlivenObjects(json: Record<string, unknown>[]): Promise<FabricObject[]> {
  return util.enlivenObjects<FabricObject>(json);
}

// ---------------------------------------------------------------------------
// Semantic export
// ---------------------------------------------------------------------------

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function colorString(value: unknown): string | null {
  if (value == null || value === '' || value === 'transparent') return null;
  if (typeof value === 'string') return value;
  // Gradients/patterns are not produced by v1 tools; describe them generically.
  return '[complex paint]';
}

function boundsOf(obj: FabricObject): Bounds {
  obj.setCoords();
  const r = obj.getBoundingRect();
  return { x: round(r.left), y: round(r.top), width: round(r.width), height: round(r.height) };
}

function visibleFraction(b: Bounds, doc: DocumentSettings) {
  const area = b.width * b.height;
  if (area <= 0) return b.x >= 0 && b.y >= 0 && b.x <= doc.width && b.y <= doc.height ? 1 : 0;
  const ix = Math.max(0, Math.min(b.x + b.width, doc.width) - Math.max(b.x, 0));
  const iy = Math.max(0, Math.min(b.y + b.height, doc.height) - Math.max(b.y, 0));
  return round((ix * iy) / area, 3);
}

function isErased(obj: FabricObject): boolean {
  if (obj.clipPath instanceof ClippingGroup) return true;
  if (obj instanceof PaintLayer) return obj.getObjects().some((s) => s.clipPath instanceof ClippingGroup);
  return false;
}

/**
 * Path data converted to artboard coordinates (includes the object's
 * position, scale, rotation and any parent group transform), so consumers
 * don't need to know about Fabric's internal coordinate spaces.
 */
function pathInArtboard(path: Path, digits = 2): string {
  const m = path.calcTransformMatrix();
  const off = path.pathOffset;
  const r = (n: number) => round(n, digits);
  return path.path
    .map((cmd) => {
      const [type, ...nums] = cmd as unknown as [string, ...number[]];
      const out: number[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const p = new Point(nums[i] - off.x, nums[i + 1] - off.y).transform(m);
        out.push(r(p.x), r(p.y));
      }
      return [type, ...out].join(' ');
    })
    .join(' ');
}

export function describeLayer(obj: FabricObject, doc: DocumentSettings): SemanticLayer {
  const kind = inferKind(obj);
  const bounds = boundsOf(obj);
  const layer: SemanticLayer = {
    id: obj.samaId ?? '',
    name: obj.samaName ?? kind,
    type: kind,
    visible: obj.visible,
    locked: !!obj.samaLocked,
    opacity: round(obj.opacity, 3),
    blendMode: (obj.globalCompositeOperation as BlendMode) || 'source-over',
    bounds,
    transform: {
      width: round(obj.getScaledWidth()),
      height: round(obj.getScaledHeight()),
      rotation: round(obj.getTotalAngle()),
      flipX: !!obj.flipX,
      flipY: !!obj.flipY,
    },
    visibleFraction: visibleFraction(bounds, doc),
    erased: isErased(obj),
  };

  const hasPaint = !(obj instanceof Group) && !(obj instanceof FabricImage);
  if (hasPaint) {
    layer.style = {
      fill: colorString(obj.fill),
      stroke: colorString(obj.stroke),
      strokeWidth: obj.stroke ? round(obj.strokeWidth) : 0,
    };
  }

  if (obj instanceof Rect) layer.shape = { cornerRadius: round(obj.rx ?? 0) };
  if (kind === 'polygon') layer.shape = { sides: obj.samaSides ?? (obj as Polygon).points?.length };

  if (obj instanceof IText) {
    layer.text = {
      content: obj.text,
      fontFamily: String(obj.fontFamily),
      fontSize: obj.fontSize,
      fontWeight: obj.fontWeight,
      fontStyle: String(obj.fontStyle),
      textAlign: obj.textAlign,
      direction: obj.direction,
      lineHeight: obj.lineHeight,
      letterSpacing: obj.charSpacing,
      color: colorString(obj.fill),
      wrapped: obj.type === 'Textbox' || obj.type === 'textbox',
    };
  }

  if (obj instanceof Path && !(obj instanceof BrushStroke)) {
    const commands = obj.path;
    layer.path = {
      d: pathInArtboard(obj),
      closed: commands.some((c) => c[0] === 'Z'),
      anchorCount: commands.filter((c) => c[0] !== 'Z').length,
    };
  }
  if (obj instanceof Polygon) {
    const m = obj.calcTransformMatrix();
    const pts = obj.points.map((p) => new Point(p.x - obj.pathOffset.x, p.y - obj.pathOffset.y).transform(m));
    layer.path = {
      d: 'M ' + pts.map((p) => `${round(p.x)} ${round(p.y)}`).join(' L ') + ' Z',
      closed: true,
      anchorCount: obj.points.length,
    };
  }

  if (obj instanceof FabricImage) {
    const el = obj.getElement() as HTMLImageElement;
    layer.image = {
      assetId: obj.samaAssetId,
      fileName: obj.samaFileName,
      naturalWidth: el?.naturalWidth ?? obj.width,
      naturalHeight: el?.naturalHeight ?? obj.height,
    };
  }

  if (obj instanceof PaintLayer) {
    const strokes = obj.getObjects();
    layer.paint = {
      strokeCount: strokes.length,
      colors: [...new Set(strokes.map((s) => colorString(s.stroke)).filter(Boolean) as string[])],
      brushSizes: [...new Set(strokes.map((s) => round((s as BrushStroke).samaBrushSize ?? s.strokeWidth, 1)))],
      strokes: strokes.map((s) => ({
        d: s instanceof Path ? pathInArtboard(s, 1) : '',
        color: colorString(s.stroke),
        size: round((s as BrushStroke).samaBrushSize ?? s.strokeWidth, 1),
        opacity: round(s.opacity, 3),
        hardness: round((s as BrushStroke).samaHardness ?? 1, 2),
        erased: s.clipPath instanceof ClippingGroup,
      })),
    };
  }

  const children = layerChildren(obj);
  if (children) {
    layer.children = [...children].reverse().map((c) => describeLayer(c, doc));
  }
  return layer;
}

export function analyze(layers: SemanticLayer[]): DocumentAnalysis {
  const byType: Partial<Record<LayerKind, number>> = {};
  const colors = new Map<string, number>();
  const fonts = new Map<string, Set<number | string>>();
  const outside: string[] = [];
  const hidden: string[] = [];
  const texts: string[] = [];
  let count = 0;

  const addColor = (c: string | null | undefined) => {
    if (!c || c === '[complex paint]') return;
    const key = c.toLowerCase();
    colors.set(key, (colors.get(key) ?? 0) + 1);
  };

  const visit = (l: SemanticLayer) => {
    count++;
    byType[l.type] = (byType[l.type] ?? 0) + 1;
    if (!l.visible) hidden.push(l.id);
    if (l.visibleFraction < 1 && l.type !== 'group') outside.push(l.id);
    addColor(l.style?.fill);
    addColor(l.style?.stroke);
    l.paint?.colors.forEach(addColor);
    if (l.text) {
      texts.push(l.text.content);
      const set = fonts.get(l.text.fontFamily) ?? new Set();
      set.add(l.text.fontWeight);
      fonts.set(l.text.fontFamily, set);
    }
    l.children?.forEach(visit);
  };
  layers.forEach(visit);

  return {
    layerCount: count,
    layerCountByType: byType,
    colors: [...colors.entries()].sort((a, b) => b[1] - a[1]).map(([color, uses]) => ({ color, uses })),
    fonts: [...fonts.entries()].map(([family, weights]) => ({ family, weights: [...weights] })),
    layersOutsideArtboard: outside,
    hiddenLayers: hidden,
    textContent: texts,
  };
}

/** Collects the asset ids referenced by a set of serialized objects. */
export function collectAssetIds(json: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(json)) {
    json.forEach((j) => collectAssetIds(j, into));
  } else if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (typeof o.samaAssetId === 'string') into.add(o.samaAssetId);
    if (Array.isArray(o.objects)) collectAssetIds(o.objects, into);
  }
  return into;
}

/**
 * Rewrites image `src` values in serialized objects according to their asset
 * id (used both to embed data URLs on export and to point at fresh blob URLs
 * on load). Returns a deep-copied array.
 */
export function rewriteImageSources(
  objects: Record<string, unknown>[],
  srcFor: (assetId: string) => string | undefined,
): Record<string, unknown>[] {
  const visit = (o: Record<string, unknown>): Record<string, unknown> => {
    const copy: Record<string, unknown> = { ...o };
    if (typeof copy.samaAssetId === 'string') {
      const src = srcFor(copy.samaAssetId);
      if (src) copy.src = src;
    }
    if (Array.isArray(copy.objects)) copy.objects = (copy.objects as Record<string, unknown>[]).map(visit);
    return copy;
  };
  return objects.map(visit);
}

// ---------------------------------------------------------------------------
// PNG rendering
// ---------------------------------------------------------------------------

export interface PngOptions {
  /** Pixel density multiplier (1 = document size). */
  scale?: number;
  /** Omit the artboard background colour. */
  transparent?: boolean;
}

/**
 * Renders the artboard to a PNG blob using an off-screen static canvas, so
 * the export never includes selection handles, guides or the pasteboard, and
 * does not depend on the current zoom/pan.
 */
export async function renderPng(
  doc: DocumentSettings,
  objects: Record<string, unknown>[],
  { scale = 1, transparent = false }: PngOptions = {},
): Promise<Blob> {
  const el = document.createElement('canvas');
  const sc = new StaticCanvas(el, {
    width: doc.width,
    height: doc.height,
    enableRetinaScaling: false,
    renderOnAddRemove: false,
    backgroundColor: transparent || !doc.background ? '' : doc.background,
  });
  try {
    const live = await enlivenObjects(objects);
    // Hidden layers are serialized with visible:false and simply not drawn.
    sc.add(...live);
    sc.renderAll();
    const out = sc.toCanvasElement(scale);
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    );
  } finally {
    sc.dispose();
  }
}

