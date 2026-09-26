/**
 * Reactive UI state for one workspace instance (Zustand).
 *
 * Division of responsibilities:
 * - The **Fabric canvas** (owned by `Editor`) is the source of truth for the
 *   drawing itself: every object, its geometry and style.
 * - This **store** holds what the React UI needs to render: the active tool,
 *   tool settings, zoom, a *derived* copy of the layers tree, a summary of the
 *   selection, and history metadata. The Editor pushes updates here after
 *   every change; components subscribe to just the slices they need, so
 *   dragging an object does not re-render the whole interface.
 *
 * A new store is created per `<SamaWorkspace>` (no global singleton), so the
 * workspace can be embedded several times on one page without conflicts.
 */
import { createStore } from 'zustand/vanilla';
import type {
  ColorSample,
  CountMarker,
  DocumentSettings,
  Guides,
  LayerNode,
  SelectionInfo,
  ToolId,
  ToolOptions,
} from '../editor/types';

export interface WorkspaceState {
  activeTool: ToolId;
  toolOptions: ToolOptions;
  zoom: number;
  doc: DocumentSettings;
  layers: LayerNode[];
  selectedIds: string[];
  selection: SelectionInfo | null;
  history: { labels: string[]; position: number; canUndo: boolean; canRedo: boolean };
  /** Pointer position in artboard pixels, or null when outside the canvas. */
  pointer: { x: number; y: number } | null;
  guides: Guides;
  showRulers: boolean;
  showGuides: boolean;
  snapping: boolean;
  /** Bumped whenever the viewport (zoom/pan) changes; rulers redraw on it. */
  viewportVersion: number;
  /** Transient notification shown at the bottom of the canvas. */
  toast: { id: number; message: string; tone: 'info' | 'warning' } | null;
  /** True while the text tool is editing a text object. */
  isEditingText: boolean;
  /** Id of the path currently being edited with the Direct Selection tool. */
  editingPathId: string | null;
  /** Color Sampler points (a viewing aid: not part of the document or undo). */
  colorSamples: ColorSample[];
  /** Whether the Color Sampler's points and panel are shown (Esc hides them). */
  colorSamplerVisible: boolean;
  /** Count tool markers in placement order (a viewing aid, like color samples). */
  countMarkers: CountMarker[];
  /** Whether the Count tool's markers are shown (Esc hides them). */
  countVisible: boolean;
  /** Bounds of the region (marching ants) selection in artboard pixels, or null. */
  pixelSelection: { x: number; y: number; width: number; height: number } | null;
  /** Artboard selected with the Artboard tool ('main' or an artboard id). */
  selectedArtboardId: string | null;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  brush: { size: 12, color: '#1f1f24', opacity: 1, hardness: 0.9, smoothing: 2 },
  eraser: { size: 24 },
  spotHealingBrush: { size: 30 },
  singleRowColumnMarquee: { orientation: 'row' },
  quickSelection: { size: 24 },
  magicWand: { tolerance: 32, contiguous: true },
  shape: { fill: '#d9d9d9', stroke: null, strokeWidth: 2, cornerRadius: 0, sides: 6 },
  pen: { fill: null, stroke: '#1f1f24', strokeWidth: 2 },
  text: {
    fontFamily: 'Cairo',
    fontSize: 48,
    fontWeight: 400,
    fontStyle: 'normal',
    fill: '#1f1f24',
    textAlign: 'left',
    direction: 'ltr',
  },
};

export const DEFAULT_DOCUMENT: DocumentSettings = {
  name: 'Untitled design',
  width: 1080,
  height: 1080,
  background: '#ffffff',
};

export function createWorkspaceStore(init?: Partial<WorkspaceState>) {
  return createStore<WorkspaceState>()(() => ({
    activeTool: 'select',
    toolOptions: structuredClone(DEFAULT_TOOL_OPTIONS),
    zoom: 1,
    doc: { ...DEFAULT_DOCUMENT },
    layers: [],
    selectedIds: [],
    selection: null,
    history: { labels: [], position: -1, canUndo: false, canRedo: false },
    pointer: null,
    guides: { vertical: [], horizontal: [] },
    showRulers: true,
    showGuides: true,
    snapping: true,
    viewportVersion: 0,
    toast: null,
    isEditingText: false,
    editingPathId: null,
    colorSamples: [],
    colorSamplerVisible: true,
    countMarkers: [],
    countVisible: true,
    pixelSelection: null,
    selectedArtboardId: null,
    ...init,
  }));
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
