/**
 * Shared types for the Sama design workspace editor core.
 *
 * The editor core (everything under `src/editor`) has no React dependency.
 * React components talk to it through the `Editor` class and read reactive
 * state from the workspace store (`src/store`).
 */

/** Every tool the workspace offers. */
export type ToolId =
  | 'select'
  | 'direct'
  | 'hand'
  | 'zoom'
  | 'brush'
  | 'eraser'
  | 'pen'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'crop'
  | 'perspectiveCrop';

/** Tools that create shapes by dragging on the canvas. */
export type ShapeToolId = Extract<ToolId, 'rect' | 'ellipse' | 'line' | 'polygon'>;

/**
 * What a layer *is*. Stored on every object as `samaKind` so the layers panel,
 * properties panel and structured export never have to guess from Fabric's
 * class names.
 */
export type LayerKind =
  | 'paint' // brush strokes (a PaintLayer group of BrushStroke paths)
  | 'path' // pen-tool vector path
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'text'
  | 'image'
  | 'group';

/** Canvas 2D composite operations exposed as layer blend modes. */
export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/** The artboard: the fixed-size area that gets exported. */
export interface DocumentSettings {
  name: string;
  width: number;
  height: number;
  /** CSS color, or `null` for a transparent background. */
  background: string | null;
}

/** A node in the layers tree shown by the layers panel (top-most first). */
export interface LayerNode {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** Only present for groups. Ordered top-most first. */
  children?: LayerNode[];
}

export interface BrushOptions {
  size: number;
  color: string;
  /** 0..1 */
  opacity: number;
  /** 0..1 — 1 is a crisp edge, 0 is a very soft edge. */
  hardness: number;
  /** Path simplification; higher = smoother, fewer points. */
  smoothing: number;
}

export interface EraserOptions {
  size: number;
}

export interface ShapeOptions {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cornerRadius: number;
  sides: number;
}

export interface PenOptions {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type TextDirection = 'ltr' | 'rtl';

export interface TextOptions {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fill: string;
  textAlign: TextAlign;
  direction: TextDirection;
}

export interface ToolOptions {
  brush: BrushOptions;
  eraser: EraserOptions;
  shape: ShapeOptions;
  pen: PenOptions;
  text: TextOptions;
}

/**
 * A flattened, UI-friendly description of the current selection, used by the
 * properties panel. Values are `undefined` when not applicable, and `'mixed'`
 * is never used — with multiple objects we only expose transform values.
 */
export interface SelectionInfo {
  count: number;
  /** `null` when several objects are selected. */
  id: string | null;
  kind: LayerKind | 'multiple';
  name: string;
  /** Axis-aligned bounds in artboard pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  cornerRadius?: number;
  sides?: number;
  text?: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontStyle: 'normal' | 'italic';
    textAlign: TextAlign;
    direction: TextDirection;
    lineHeight: number;
    charSpacing: number;
  };
  image?: { naturalWidth: number; naturalHeight: number; fileName?: string };
  /** True when the selection can be edited with the Direct Selection tool. */
  hasAnchors: boolean;
}

/** Patch accepted by `Editor.updateSelection`. */
export interface SelectionPatch {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  opacity?: number;
  blendMode?: BlendMode;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  cornerRadius?: number;
  sides?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textAlign?: TextAlign;
  direction?: TextDirection;
  lineHeight?: number;
  charSpacing?: number;
}

export interface Guides {
  /** Vertical guides, x positions in artboard pixels. */
  vertical: number[];
  /** Horizontal guides, y positions in artboard pixels. */
  horizontal: number[];
}

export interface HistoryEntryInfo {
  label: string;
}
