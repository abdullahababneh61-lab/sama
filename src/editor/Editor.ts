/**
 * Editor — the headless core of the Sama design workspace.
 *
 * Owns the Fabric canvas and everything that happens on it: tools, viewport
 * (zoom/pan), layer operations, selection, undo/redo history, import and
 * export. React components never touch Fabric directly; they call methods on
 * this class and read the reactive state it publishes to the workspace store.
 *
 * Coordinate systems
 * ------------------
 * - *Scene* (a.k.a. artboard) coordinates: document pixels. The artboard
 *   occupies (0,0)–(doc.width, doc.height). All object geometry lives here.
 * - *Viewport* coordinates: CSS pixels of the on-screen canvas element.
 *   Zoom/pan is Fabric's `viewportTransform` mapping scene → viewport.
 */
import {
  ActiveSelection,
  controlsUtils,
  FabricImage,
  FabricObject,
  Group,
  IText,
  Path,
  Point,
  Polygon,
  Rect,
  Ellipse,
  util,
  version as fabricVersion,
} from 'fabric';
import type { TPointerEvent, TPointerEventInfo, BasicTransformEvent, ModifiedEvent } from 'fabric';
import { configureFabric } from './fabricSetup';
import { SamaCanvas } from './SamaCanvas';
import { History, type Snapshot } from './history';
import { AssetRegistry } from './assets';
import {
  applyLockState,
  buildLayerTree,
  collectIds,
  createId,
  ensureMeta,
  findById,
  inferKind,
  isEffectivelyLocked,
  isEffectivelyVisible,
  kindLabel,
  reassignIds,
  walkLayers,
  isAnchorEditable,
} from './meta';

export { isAnchorEditable };
import {
  analyze,
  collectAssetIds,
  describeLayer,
  DOCUMENT_FORMAT,
  DOCUMENT_VERSION,
  enlivenObjects,
  renderPng,
  rewriteImageSources,
  serializeObject,
  WORKSPACE_VERSION,
  type PngOptions,
  type SamaDocument,
} from './serialization';
import { computeSnap, type SnapLine } from './snapping';
import { anchorIndexFromControlKey, createAnchorControls, toggleAnchorSmooth } from './pathEditing';
import { ensureFontLoaded } from './fonts';
import { regularPolygonPoints } from './geometry';
import { PaintLayer } from './objects/PaintLayer';
import type { WorkspaceStore, WorkspaceState } from '../store/workspaceStore';
import type {
  BlendMode,
  DocumentSettings,
  LayerKind,
  SelectionInfo,
  SelectionPatch,
  TextAlign,
  ToolId,
  ToolOptions,
} from './types';
import { Tool, type ToolPointerEvent } from './tools/Tool';
import { SelectTool } from './tools/SelectTool';
import { DirectSelectTool } from './tools/DirectSelectTool';
import { HandTool } from './tools/HandTool';
import { ZoomTool } from './tools/ZoomTool';
import { BrushTool } from './tools/BrushTool';
import { EraserTool } from './tools/EraserTool';
import { PenTool } from './tools/PenTool';
import { TextTool } from './tools/TextTool';
import { ShapeTool } from './tools/ShapeTool';
import { CropTool } from './tools/CropTool';
import { PerspectiveCropTool } from './tools/PerspectiveCropTool';
import { EyedropperTool } from './tools/EyedropperTool';
import { ColorSamplerTool } from './tools/ColorSamplerTool';
import { RulerTool } from './tools/RulerTool';
import { CountTool } from './tools/CountTool';
import { SpotHealingBrushTool } from './tools/SpotHealingBrushTool';
import { HealingBrushTool } from './tools/HealingBrushTool';
import { ArtboardTool } from './tools/ArtboardTool';
import { RectMarqueeTool } from './tools/RectMarqueeTool';
import { EllipseMarqueeTool } from './tools/EllipseMarqueeTool';
import { SingleRowColumnMarqueeTool } from './tools/SingleRowColumnMarqueeTool';
import { LassoTool } from './tools/LassoTool';
import { PolygonalLassoTool } from './tools/PolygonalLassoTool';
import { MagneticLassoTool } from './tools/MagneticLassoTool';
import { ObjectSelectionTool } from './tools/ObjectSelectionTool';
import { QuickSelectionTool } from './tools/QuickSelectionTool';
import { MagicWandTool } from './tools/MagicWandTool';
import { GroupSelectionTool } from './tools/GroupSelectionTool';
import { PixelSelection, type CombineMode, type SelectionShape } from './pixelSelection';
import { SelectionAnts } from './SelectionAnts';
import { renderArtboardPixels, type ScenePixels } from './scenePixels';
import { applySelectionToImage, selectionAlphaCanvas, withOffscreenRendering } from './selectionLayers';
import {
  ARTBOARD_LABEL_FONT,
  PASTEBOARD_COLOR,
  artboardsToDocument,
  listArtboards,
  MAIN_ARTBOARD_ID,
  owningArtboard,
  type ArtboardRect,
} from './artboards';
import { correctedSize, isValidQuad, type XY } from './perspective';
import { perspectiveWarpLayers } from './perspectiveCrop';
import { ClippingGroup } from '@erase2d/fabric';

export interface EditorOptions {
  /** Element that will contain the canvas. It must have a size (CSS). */
  host: HTMLElement;
  store: WorkspaceStore;
  /** Localized default layer names ("Rectangle", "مستطيل"…). */
  layerLabels?: Partial<Record<LayerKind, string>>;
  /** Called after every undoable change (e.g. to autosave in the host app). */
  onChange?: () => void;
  /** Localizes an i18n key for text the editor shows itself (confirmations, default names). */
  translate?: (key: string, params?: Record<string, string | number>) => string;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;
const GUIDE_COLOR = '#16c6ff';
const SNAP_COLOR = '#ff3d9a';
const HOVER_COLOR = '#4d8dff';
const NUDGE = 1;
const NUDGE_BIG = 10;
const PASTE_OFFSET = 16;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export class Editor {
  readonly canvas: SamaCanvas;
  readonly store: WorkspaceStore;
  readonly history = new History();
  readonly assets = new AssetRegistry();
  /** The region ("marching ants") selection of the marquee/lasso tools. */
  readonly pixelSelection = new PixelSelection();

  private readonly host: HTMLElement;
  private readonly canvasEl: HTMLCanvasElement;
  private readonly brushCursor: HTMLDivElement;
  private readonly tools: Record<ToolId, Tool>;
  private activeToolId: ToolId = 'select';
  /** The tool that was active before the current one (the eyedropper returns to it). */
  private previousToolId: ToolId | null = null;
  /** Tool temporarily active while a key is held (Space → hand). */
  private springToolId: ToolId | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly layerLabels: Partial<Record<LayerKind, string>>;
  private readonly onChange?: () => void;
  /** Localizes an i18n key (see `EditorOptions.translate`). */
  readonly translate: (key: string, params?: Record<string, string | number>) => string;
  private nameCounters: Partial<Record<LayerKind, number>> = {};
  private restoring = false;
  private clipboard: { objects: Record<string, unknown>[]; pasteCount: number } | null = null;
  /** Groups temporarily made "interactive" because a child is selected. */
  private openedGroups: Group[] = [];
  private hovered: FabricObject | null = null;
  /** Overrides the history label of the transform in progress (e.g. Alt-drag → "Duplicate"). */
  nextTransformLabel: string | null = null;
  private hoveredLayerId: string | null = null;
  private snapLines: SnapLine[] = [];
  private selectionSyncHandle = 0;
  private hasFitted = false;
  private disposed = false;
  private checkerPattern: CanvasPattern | null = null;
  /** Object whose anchors are being edited with the Direct Selection tool. */
  private editingPath: FabricObject | null = null;
  private editingPathControls: FabricObject['controls'] | null = null;
  private readonly ants: SelectionAnts;
  private readonly unsubscribeStore: () => void;
  /** Artboards drawn instead of the document's while the Artboard tool drags one. */
  private artboardPreview: ArtboardRect[] | null = null;
  private labelMeasure: CanvasRenderingContext2D | null = null;

  constructor(options: EditorOptions) {
    configureFabric();
    this.host = options.host;
    this.store = options.store;
    this.layerLabels = options.layerLabels ?? {};
    this.onChange = options.onChange;
    this.translate = options.translate ?? ((key) => key);

    this.canvasEl = document.createElement('canvas');
    this.host.appendChild(this.canvasEl);
    const { width, height } = this.host.getBoundingClientRect();

    this.canvas = new SamaCanvas(this.canvasEl, {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: false,
      controlsAboveOverlay: true,
      selectionColor: 'rgba(77, 141, 255, 0.10)',
      selectionBorderColor: 'rgba(77, 141, 255, 0.9)',
      selectionLineWidth: 1,
      uniformScaling: true,
      uniScaleKey: 'shiftKey',
      altActionKey: 'shiftKey',
      centeredKey: 'altKey',
      renderOnAddRemove: false,
      imageSmoothingEnabled: true,
    });
    this.canvas.renderBackdrop = (ctx) => this.renderBackdrop(ctx);
    this.canvas.renderOverlay = (ctx, isMain) => this.renderOverlay(ctx, isMain);

    // A DOM circle that follows the pointer for brush/eraser sizing feedback.
    this.brushCursor = document.createElement('div');
    this.brushCursor.className = 'sw-brush-cursor';
    this.host.appendChild(this.brushCursor);

    this.pixelSelection.fit(this.doc.width, this.doc.height);
    this.ants = new SelectionAnts(this.host, this.pixelSelection, () => this.canvas.viewportTransform);
    // The region selection covers the main artboard: resizing the artboard
    // (canvas size, crop, undo…) clears it.
    this.unsubscribeStore = this.store.subscribe((s, prev) => {
      if (s.doc.width !== prev.doc.width || s.doc.height !== prev.doc.height) {
        const had = !this.pixelSelection.isEmpty;
        this.pixelSelection.fit(s.doc.width, s.doc.height);
        if (had) this.publishPixelSelection();
      }
    });

    this.tools = {
      select: new SelectTool(this),
      direct: new DirectSelectTool(this),
      hand: new HandTool(this),
      zoom: new ZoomTool(this),
      brush: new BrushTool(this),
      eraser: new EraserTool(this),
      pen: new PenTool(this),
      text: new TextTool(this),
      rect: new ShapeTool(this, 'rect'),
      ellipse: new ShapeTool(this, 'ellipse'),
      line: new ShapeTool(this, 'line'),
      polygon: new ShapeTool(this, 'polygon'),
      crop: new CropTool(this),
      perspectiveCrop: new PerspectiveCropTool(this),
      eyedropper: new EyedropperTool(this),
      colorSampler: new ColorSamplerTool(this),
      ruler: new RulerTool(this),
      count: new CountTool(this),
      spotHealingBrush: new SpotHealingBrushTool(this),
      healingBrush: new HealingBrushTool(this),
      artboard: new ArtboardTool(this),
      rectMarquee: new RectMarqueeTool(this),
      ellipseMarquee: new EllipseMarqueeTool(this),
      singleRowColumnMarquee: new SingleRowColumnMarqueeTool(this),
      lasso: new LassoTool(this),
      polygonalLasso: new PolygonalLassoTool(this),
      magneticLasso: new MagneticLassoTool(this),
      objectSelection: new ObjectSelectionTool(this),
      quickSelection: new QuickSelectionTool(this),
      magicWand: new MagicWandTool(this),
      groupSelection: new GroupSelectionTool(this),
    };

    this.bindCanvasEvents();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.host);

    this.applyToolMode();
    this.tool.activate();
    this.history.reset(this.takeSnapshot('New document'));
    this.syncAll();
    this.handleResize();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.tool.deactivate();
    cancelAnimationFrame(this.selectionSyncHandle);
    this.resizeObserver.disconnect();
    this.unsubscribeStore();
    this.ants.dispose();
    // Remove Fabric's DOM right away (dispose() itself is asynchronous).
    const wrapper = (this.canvas as unknown as { wrapperEl?: HTMLElement }).wrapperEl;
    void this.canvas.dispose().then(() => this.canvasEl.remove());
    wrapper?.remove();
    this.brushCursor.remove();
    this.assets.dispose();
  }

  // =========================================================================
  // Store helpers
  // =========================================================================

  get state(): WorkspaceState {
    return this.store.getState();
  }

  get doc(): DocumentSettings {
    return this.store.getState().doc;
  }

  get toolOptions(): ToolOptions {
    return this.store.getState().toolOptions;
  }

  private set(partial: Partial<WorkspaceState>) {
    this.store.setState(partial);
  }

  /** Shows a short message at the bottom of the canvas (i18n key). */
  notify(message: string, tone: 'info' | 'warning' = 'info') {
    this.set({ toast: { id: Date.now(), message, tone } });
  }

  /** Next default name for a new layer, e.g. "Rectangle 3". */
  nameFor = (kind: LayerKind): string => {
    const n = (this.nameCounters[kind] ?? 0) + 1;
    this.nameCounters[kind] = n;
    return `${this.layerLabels[kind] ?? kindLabel(kind)} ${n}`;
  };

  // =========================================================================
  // Tools
  // =========================================================================

  get tool(): Tool {
    return this.tools[this.springToolId ?? this.activeToolId];
  }

  get activeTool(): ToolId {
    return this.activeToolId;
  }

  get previousTool(): ToolId | null {
    return this.previousToolId;
  }

  getTool<T extends Tool>(id: ToolId): T {
    return this.tools[id] as T;
  }

  setTool(id: ToolId) {
    if (id === this.activeToolId && !this.springToolId) return;
    this.tool.deactivate();
    this.springToolId = null;
    this.previousToolId = this.activeToolId;
    this.activeToolId = id;
    this.applyToolMode();
    this.tool.activate();
    this.set({ activeTool: id });
  }

  /** Temporarily switches tool while a key is held (e.g. Space → Hand). */
  private beginSpringTool(id: ToolId) {
    if (this.springToolId || this.activeToolId === id) return;
    this.tool.deactivate();
    this.springToolId = id;
    this.applyToolMode();
    this.tool.activate();
  }

  private endSpringTool() {
    if (!this.springToolId) return;
    this.tool.deactivate();
    this.springToolId = null;
    this.applyToolMode();
    this.tool.activate();
  }

  /** Configures Fabric's interaction flags for the current tool. */
  applyToolMode() {
    const tool = this.tool;
    const c = this.canvas;
    c.isDrawingMode = false;
    c.selection = tool.selectsObjects && tool.marquee;
    c.skipTargetFind = !tool.selectsObjects && !tool.targetFilter;
    c.targetFilter = tool.targetFilter;
    c.controlsMode = tool.showsControls ? 'full' : 'none';
    c.defaultCursor = tool.cursor;
    c.hoverCursor = tool.selectsObjects ? 'move' : tool.cursor;
    c.moveCursor = tool.selectsObjects ? 'move' : tool.cursor;
    c.freeDrawingCursor = tool.cursor;
    this.setHovered(null);
    this.hideBrushCursor();
    c.requestRenderAll();
  }

  /** Re-applies the cursor (tools with dynamic cursors call this). */
  setCursor(cursor: string) {
    this.canvas.defaultCursor = cursor;
    this.canvas.setCursor(cursor);
  }

  updateToolOptions<K extends keyof ToolOptions>(tool: K, patch: Partial<ToolOptions[K]>) {
    const current = this.state.toolOptions;
    this.set({ toolOptions: { ...current, [tool]: { ...current[tool], ...patch } } });
    this.tool.onOptionsChanged();
  }

  // =========================================================================
  // Canvas events
  // =========================================================================

  private toToolEvent(opt: TPointerEventInfo<TPointerEvent>): ToolPointerEvent {
    const e = opt.e as MouseEvent;
    return {
      e: opt.e,
      scenePoint: opt.scenePoint ?? this.canvas.getScenePoint(opt.e),
      viewportPoint: opt.viewportPoint ?? this.canvas.getViewportPoint(opt.e),
      target: opt.target,
      shift: !!e.shiftKey,
      alt: !!e.altKey,
      mod: isMac ? !!e.metaKey : !!e.ctrlKey,
    };
  }

  private bindCanvasEvents() {
    const c = this.canvas;

    c.on('mouse:down', (opt) => this.tool.onPointerDown(this.toToolEvent(opt)));
    c.on('mouse:move', (opt) => {
      const ev = this.toToolEvent(opt);
      this.set({ pointer: { x: Math.round(ev.scenePoint.x), y: Math.round(ev.scenePoint.y) } });
      this.tool.onPointerMove(ev);
    });
    c.on('mouse:up', (opt) => this.tool.onPointerUp(this.toToolEvent(opt)));
    c.on('mouse:dblclick', (opt) => this.tool.onDoubleClick(this.toToolEvent(opt)));
    c.on('mouse:out', () => {
      this.set({ pointer: null });
      this.hideBrushCursor();
    });
    c.on('mouse:over', (opt) => {
      if (this.tool.selectsObjects && opt.target) this.setHovered(opt.target);
    });
    c.on('mouse:out', (opt) => {
      if (opt.target && opt.target === this.hovered) this.setHovered(null);
    });

    c.on('mouse:wheel', (opt) => this.handleWheel(opt.e as WheelEvent));

    c.on('selection:created', () => this.handleSelectionChange());
    c.on('selection:updated', () => this.handleSelectionChange());
    c.on('selection:cleared', () => this.handleSelectionChange());

    const live = () => this.scheduleSelectionSync();
    c.on('object:moving', (e) => {
      this.handleObjectMoving(e);
      live();
    });
    c.on('object:scaling', live);
    c.on('object:rotating', (e) => {
      // Shift snaps rotation to 15° steps (industry convention).
      if ((e.e as MouseEvent)?.shiftKey) {
        const t = e.target;
        t.rotate(Math.round(t.angle / 15) * 15);
      }
      live();
    });
    c.on('object:resizing', live);

    c.on('object:modified', (e: ModifiedEvent) => {
      this.snapLines = [];
      const action = e.transform?.action ?? e.action;
      const override = this.nextTransformLabel;
      this.nextTransformLabel = null;
      const label = override
        ? override
        : action === 'drag'
          ? 'Move'
          : action === 'rotate'
            ? 'Rotate'
            : action === 'modifyPath' || action === 'modifyPoly'
              ? 'Edit anchors'
              : action?.startsWith('scale') || action === 'resizing'
                ? 'Resize'
                : 'Transform';
      this.commit(label);
    });

    c.on('text:editing:entered', () => this.set({ isEditingText: true }));
    c.on('text:editing:exited', (e) => this.handleTextEditExit(e.target));
    c.on('text:changed', live);
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    const pointer = this.canvas.getViewportPoint(e);
    if (e.ctrlKey || e.metaKey) {
      // Pinch-zoom on trackpads also arrives as ctrl+wheel.
      const factor = Math.pow(0.998, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY);
      this.zoomTo(this.canvas.getZoom() * factor, pointer);
    } else {
      const scale = e.deltaMode === 1 ? 16 : 1;
      let dx = -e.deltaX * scale;
      let dy = -e.deltaY * scale;
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      this.panBy(dx, dy);
    }
  }

  private handleResize() {
    if (this.disposed) return;
    const { width, height } = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.canvas.width && h === this.canvas.height && this.hasFitted) return;
    const oldCenter = new Point(this.canvas.width / 2, this.canvas.height / 2);
    this.canvas.setDimensions({ width: w, height: h });
    this.ants.resize(w, h);
    if (!this.hasFitted && w > 10 && h > 10) {
      this.hasFitted = true;
      this.fitToScreen();
    } else {
      // Keep the view centred on the same scene point.
      this.panBy(w / 2 - oldCenter.x, h / 2 - oldCenter.y);
    }
    this.tool.onOptionsChanged();
  }

  // =========================================================================
  // Viewport
  // =========================================================================

  /** Zooms to `zoom`, keeping `viewportPoint` fixed on screen. */
  zoomTo(zoom: number, viewportPoint?: Point) {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    const p = viewportPoint ?? new Point(this.canvas.width / 2, this.canvas.height / 2);
    this.canvas.zoomToPoint(p, z);
    this.onViewportChanged();
  }

  /** Steps through common zoom levels (like Ctrl + / Ctrl -). */
  zoomStep(direction: 1 | -1, viewportPoint?: Point) {
    const levels = [0.02, 0.05, 0.1, 0.125, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
    const z = this.canvas.getZoom();
    const next =
      direction > 0 ? levels.find((l) => l > z * 1.001) ?? MAX_ZOOM : [...levels].reverse().find((l) => l < z / 1.001) ?? MIN_ZOOM;
    this.zoomTo(next, viewportPoint);
  }

  panBy(dx: number, dy: number) {
    this.canvas.relativePan(new Point(dx, dy));
    this.onViewportChanged();
  }

  /** Fits the whole artboard in the view with a comfortable margin. */
  fitToScreen() {
    const { width: dw, height: dh } = this.doc;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const margin = Math.min(64, Math.min(cw, ch) * 0.08);
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((cw - margin * 2) / dw, (ch - margin * 2) / dh)));
    this.canvas.setViewportTransform([z, 0, 0, z, (cw - dw * z) / 2, (ch - dh * z) / 2]);
    this.onViewportChanged();
  }

  /** 100% zoom, centred on the artboard. */
  zoomToActualSize() {
    const { width: dw, height: dh } = this.doc;
    this.canvas.setViewportTransform([1, 0, 0, 1, (this.canvas.width - dw) / 2, (this.canvas.height - dh) / 2]);
    this.onViewportChanged();
  }

  /** Zooms to fit the current selection. */
  zoomToSelection() {
    const active = this.canvas.getActiveObject();
    if (!active) return this.fitToScreen();
    const r = active.getBoundingRect();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((cw * 0.8) / Math.max(r.width, 1), (ch * 0.8) / Math.max(r.height, 1))));
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    this.canvas.setViewportTransform([z, 0, 0, z, cw / 2 - cx * z, ch / 2 - cy * z]);
    this.onViewportChanged();
  }

  private onViewportChanged() {
    this.set({ zoom: this.canvas.getZoom(), viewportVersion: this.state.viewportVersion + 1 });
    this.ants.update();
    this.tool.onOptionsChanged();
    this.canvas.requestRenderAll();
  }

  /** Scene (artboard) point → viewport point. */
  sceneToViewport(p: { x: number; y: number }): Point {
    return new Point(p.x, p.y).transform(this.canvas.viewportTransform);
  }

  viewportToScene(p: { x: number; y: number }): Point {
    return new Point(p.x, p.y).transform(util.invertTransform(this.canvas.viewportTransform));
  }

  /** Scene point under a client (page) coordinate, e.g. from a drop event. */
  clientToScene(clientX: number, clientY: number): Point {
    const rect = this.canvasEl.getBoundingClientRect();
    return this.viewportToScene({ x: clientX - rect.left, y: clientY - rect.top });
  }

  // =========================================================================
  // Rendering: artboard backdrop and overlays
  // =========================================================================

  private getCheckerPattern(ctx: CanvasRenderingContext2D) {
    if (this.checkerPattern) return this.checkerPattern;
    const tile = document.createElement('canvas');
    tile.width = tile.height = 16;
    const t = tile.getContext('2d')!;
    t.fillStyle = '#ffffff';
    t.fillRect(0, 0, 16, 16);
    t.fillStyle = '#e3e3e8';
    t.fillRect(0, 0, 8, 8);
    t.fillRect(8, 8, 8, 8);
    this.checkerPattern = ctx.createPattern(tile, 'repeat');
    return this.checkerPattern;
  }

  private renderBackdrop(ctx: CanvasRenderingContext2D) {
    const { background } = this.doc;
    const v = this.canvas.viewportTransform;
    ctx.save();
    ctx.fillStyle = PASTEBOARD_COLOR;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const artboards = this.getArtboards();
    for (const a of artboards) {
      const x = a.x * v[0] + v[4];
      const y = a.y * v[3] + v[5];
      const w = a.width * v[0];
      const h = a.height * v[3];
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 2;
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(x, y, w, h);
      } else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, w, h);
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = this.getCheckerPattern(ctx) ?? '#fff';
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    }
    // Artboard names (only once there is more than one, or with the Artboard tool).
    if (artboards.length > 1 || this.activeToolId === 'artboard') {
      ctx.font = ARTBOARD_LABEL_FONT;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      for (const a of artboards) {
        const box = this.artboardLabelBox(a);
        ctx.fillText(box.text, box.x, box.y + box.h - 3);
      }
    }
    ctx.restore();
  }

  /**
   * Where an artboard's name label is drawn (viewport coordinates): just
   * above its top-left corner, truncated to the artboard's on-screen width.
   */
  artboardLabelBox(a: ArtboardRect): { x: number; y: number; w: number; h: number; text: string } {
    const v = this.canvas.viewportTransform;
    if (!this.labelMeasure) this.labelMeasure = document.createElement('canvas').getContext('2d');
    const m = this.labelMeasure;
    const maxW = Math.max(40, a.width * v[0]);
    let text = a.name || ' ';
    if (m) {
      m.font = ARTBOARD_LABEL_FONT;
      if (m.measureText(text).width > maxW) {
        while (text.length > 1 && m.measureText(text + '…').width > maxW) text = text.slice(0, -1);
        text += '…';
      }
    }
    const w = m ? m.measureText(text).width : text.length * 6;
    const h = 16;
    return { x: a.x * v[0] + v[4], y: a.y * v[3] + v[5] - h - 2, w, h, text };
  }

  private renderOverlay(ctx: CanvasRenderingContext2D, isMain: boolean) {
    const v = this.canvas.viewportTransform;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.save();

    // Guides
    const { guides, showGuides } = this.state;
    if (showGuides) {
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const gx of guides.vertical) {
        const x = Math.round(gx * v[0] + v[4]) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
      }
      for (const gy of guides.horizontal) {
        const y = Math.round(gy * v[3] + v[5]) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
      }
      ctx.stroke();
    }

    if (isMain) {
      // Snap lines while moving
      if (this.snapLines.length) {
        ctx.strokeStyle = SNAP_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const l of this.snapLines) {
          if (l.orientation === 'vertical') {
            const x = Math.round(l.value * v[0] + v[4]) + 0.5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ch);
          } else {
            const y = Math.round(l.value * v[3] + v[5]) + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(cw, y);
          }
        }
        ctx.stroke();
      }

      // Hover outline (canvas hover or layers-panel hover)
      const hoverTarget =
        (this.hoveredLayerId && findById(this.canvas, this.hoveredLayerId)) || (this.tool.selectsObjects ? this.hovered : null);
      const active = this.canvas.getActiveObjects();
      if (hoverTarget && !active.includes(hoverTarget) && hoverTarget.visible) {
        this.strokeObjectOutline(ctx, hoverTarget, HOVER_COLOR, 1.5);
      }

      // Tool visuals
      this.tool.renderOverlay(ctx);
    }
    ctx.restore();
  }

  /** Strokes an object's (rotated) bounding outline in viewport space. */
  strokeObjectOutline(ctx: CanvasRenderingContext2D, obj: FabricObject, color: string, width = 1) {
    obj.setCoords();
    const pts = obj.getCoords().map((p) => this.sceneToViewport(p));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private setHovered(obj: FabricObject | null) {
    if (this.hovered === obj) return;
    this.hovered = obj;
    this.canvas.requestRenderAll();
  }

  /** Highlights a layer on canvas while hovering its row in the layers panel. */
  setHoveredLayer(id: string | null) {
    if (this.hoveredLayerId === id) return;
    this.hoveredLayerId = id;
    this.canvas.requestRenderAll();
  }

  /** Positions the round brush-size cursor (viewport coordinates). */
  showBrushCursor(viewportPoint: Point, diameterScene: number) {
    const d = Math.max(2, diameterScene * this.canvas.getZoom());
    const s = this.brushCursor.style;
    s.display = 'block';
    s.width = s.height = `${d}px`;
    s.transform = `translate(${viewportPoint.x - d / 2}px, ${viewportPoint.y - d / 2}px)`;
  }

  hideBrushCursor() {
    this.brushCursor.style.display = 'none';
  }

  // =========================================================================
  // Snapping
  // =========================================================================

  private handleObjectMoving(e: BasicTransformEvent & { target: FabricObject }) {
    const target = e.target;
    const ev = e.e as MouseEvent;
    this.snapLines = [];
    // Shift constrains movement to the dominant axis.
    const t = e.transform;
    if (ev?.shiftKey && t) {
      const dx = Math.abs(target.left - t.original.left);
      const dy = Math.abs(target.top - t.original.top);
      if (dx > dy) target.set('top', t.original.top);
      else target.set('left', t.original.left);
    }
    if (!this.state.snapping || ev?.altKey || target.group) return;
    target.setCoords();
    const box = target.getBoundingRect();
    const { width, height } = this.doc;
    const xs = [0, width / 2, width];
    const ys = [0, height / 2, height];
    if (this.state.showGuides) {
      xs.push(...this.state.guides.vertical);
      ys.push(...this.state.guides.horizontal);
    }
    const moving = new Set(this.canvas.getActiveObjects());
    moving.add(target);
    for (const obj of this.canvas.getObjects()) {
      if (moving.has(obj) || !obj.visible) continue;
      const r = obj.getBoundingRect();
      xs.push(r.left, r.left + r.width / 2, r.left + r.width);
      ys.push(r.top, r.top + r.height / 2, r.top + r.height);
    }
    const threshold = 6 / this.canvas.getZoom();
    const snap = computeSnap(box, xs, ys, threshold);
    if (snap.dx || snap.dy) {
      target.set({ left: target.left + snap.dx, top: target.top + snap.dy });
      target.setCoords();
    }
    this.snapLines = snap.lines;
  }

  // =========================================================================
  // Selection
  // =========================================================================

  getSelectedObjects(): FabricObject[] {
    return this.canvas.getActiveObjects();
  }

  /** Selects the given objects (siblings only for multi-selection). */
  selectObjects(objects: FabricObject[]) {
    const c = this.canvas;
    const valid = objects.filter(Boolean);
    c.discardActiveObject();
    if (valid.length === 1) {
      this.openGroupsFor(valid[0]);
      c.setActiveObject(valid[0]);
    } else if (valid.length > 1) {
      const parent = valid[0].parent;
      const siblings = valid.filter((o) => o.parent === parent && !isEffectivelyLocked(o));
      if (siblings.length === 1) c.setActiveObject(siblings[0]);
      else if (siblings.length > 1) {
        this.openGroupsFor(siblings[0]);
        c.setActiveObject(new ActiveSelection(siblings, { canvas: c }));
      }
    }
    this.handleSelectionChange();
    c.requestRenderAll();
  }

  selectByIds(ids: string[]) {
    this.selectObjects(ids.map((id) => findById(this.canvas, id)).filter((o): o is FabricObject => !!o));
  }

  /**
   * Layers-panel click semantics: plain click selects one layer; Shift/Ctrl
   * adds or removes it from the selection (same parent only).
   */
  selectLayerFromPanel(id: string, mode: 'replace' | 'toggle' | 'range', orderedIds: string[]) {
    const current = this.state.selectedIds;
    if (mode === 'replace') return this.selectByIds([id]);
    if (mode === 'toggle') {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return this.selectByIds(next);
    }
    const anchor = current[current.length - 1] ?? id;
    const a = orderedIds.indexOf(anchor);
    const b = orderedIds.indexOf(id);
    if (a < 0 || b < 0) return this.selectByIds([id]);
    this.selectByIds(orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1));
  }

  selectAll() {
    if (this.tool.id !== 'select' && this.tool.id !== 'direct') this.setTool('select');
    const objs = this.canvas.getObjects().filter((o) => o.visible && !o.samaLocked);
    this.selectObjects(objs);
  }

  clearSelection() {
    this.canvas.discardActiveObject();
    this.handleSelectionChange();
    this.canvas.requestRenderAll();
  }

  /** Top-most visible, unlocked top-level layer under a scene point. */
  layerAt(point: Point): FabricObject | null {
    const objs = this.canvas.getObjects();
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (!o.visible || isEffectivelyLocked(o)) continue;
      o.setCoords();
      if (o.containsPoint(point)) return o;
    }
    return null;
  }

  // =========================================================================
  // Region (pixel) selection — marquee, lasso and quick-selection tools
  // =========================================================================

  /** Adds, subtracts or replaces the region selection with a shape (artboard coordinates). */
  selectRegion(shape: SelectionShape, mode: CombineMode) {
    this.pixelSelection.fit(this.doc.width, this.doc.height);
    this.pixelSelection.combine(shape, mode);
    this.publishPixelSelection();
  }

  /** Replaces the region selection with a mask (see `PixelSelection`). */
  setRegionMask(mask: Uint8Array) {
    this.pixelSelection.setMask(mask);
    this.publishPixelSelection();
  }

  clearPixelSelection() {
    if (this.pixelSelection.isEmpty) return;
    this.pixelSelection.clear();
    this.publishPixelSelection();
  }

  invertPixelSelection() {
    this.pixelSelection.fit(this.doc.width, this.doc.height);
    this.pixelSelection.invert();
    this.publishPixelSelection();
  }

  /** Crops the artboard to the region selection's bounding box (uses the regular crop). */
  cropToPixelSelection() {
    const b = this.pixelSelection.bounds();
    if (!b) return;
    this.pixelSelection.clear();
    this.publishPixelSelection();
    this.cropArtboard({ x: b.x, y: b.y, w: b.width, h: b.height });
  }

  /** Pushes the region selection's bounds to the UI and redraws the marching ants. */
  publishPixelSelection() {
    const b = this.pixelSelection.bounds();
    const r = (n: number) => Math.round(n * 100) / 100;
    this.set({ pixelSelection: b ? { x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height) } : null });
    this.ants.update();
  }

  /** The main artboard rendered at the region selection's resolution. */
  renderArtboardPixels(): ScenePixels {
    this.pixelSelection.fit(this.doc.width, this.doc.height);
    const { width, height } = this.pixelSelection;
    // Off-view layers must be drawn too (Fabric skips them by default).
    return withOffscreenRendering(this.canvas, () => renderArtboardPixels(this.canvas.getObjects(), this.doc, width, height));
  }

  /**
   * Refines the region selection in place (amounts in artboard pixels):
   * Feather softens its edge, Smooth rounds off jagged bits, Expand/Contract
   * grow or shrink it. Everything that uses the selection sees the result.
   */
  refinePixelSelection(op: 'feather' | 'smooth' | 'expand' | 'contract', amount: number) {
    if (this.pixelSelection.isEmpty) return;
    this.pixelSelection[op](amount);
    this.publishPixelSelection();
  }

  private layerViaBusy = false;

  /**
   * "Copy to New Layer" (Ctrl+J) / "Cut to New Layer" (Shift+Ctrl+J), like
   * Photoshop's Layer via Copy / Layer via Cut: the pixels inside the region
   * selection's exact shape go to a new image layer directly above the
   * original, transparent everywhere else; a cut also removes them from the
   * original. The new layer becomes the selected layer, the region selection
   * is cleared, and it's one undoable step.
   *
   * Works on image layers: the selected layer, or — with no layer selected —
   * the top-most visible, unlocked image with pixels inside the selection.
   * The new layer keeps the original's size, position, transform, opacity,
   * blend mode and masks (it's a copy of the layer with new pixels).
   * Resolves to the new layer, or null when nothing could be copied.
   */
  async layerViaSelection(mode: 'copy' | 'cut'): Promise<FabricObject | null> {
    const sel = this.pixelSelection;
    if (sel.isEmpty) {
      this.notify('toast.layerViaNoSelection', 'warning');
      return null;
    }
    if (this.layerViaBusy) return null;
    this.layerViaBusy = true;
    try {
      this.exitTextEditing();
      this.stopPathEditing();
      sel.fit(this.doc.width, this.doc.height);
      const usable = (o: FabricObject): o is FabricImage => o instanceof FabricImage && isEffectivelyVisible(o) && !isEffectivelyLocked(o);
      const active = this.canvas.getActiveObjects();
      let candidates: FabricImage[];
      if (active.length) {
        candidates = active.filter(usable).reverse(); // top-most first
        if (!candidates.length) {
          this.notify('toast.layerViaNeedsImage', 'warning');
          return null;
        }
      } else {
        const all: FabricImage[] = [];
        walkLayers(this.canvas.getObjects(), (o) => {
          if (usable(o)) all.push(o);
        });
        candidates = all.reverse(); // walkLayers goes bottom to top
      }
      // Leave any multi-selection first so layers are back in their own coordinates.
      this.canvas.discardActiveObject();
      const selection = selectionAlphaCanvas(sel);
      let target: FabricImage | null = null;
      let copied: HTMLCanvasElement | null = null;
      for (const img of candidates) {
        copied = applySelectionToImage(img, selection, sel.scale, 'keep');
        if (copied) {
          target = img;
          break;
        }
      }
      if (!target || !copied) {
        this.handleSelectionChange();
        this.notify(candidates.length ? 'toast.layerViaEmpty' : 'toast.layerViaNeedsImage', 'warning');
        return null;
      }

      const name = target.samaName ?? kindLabel('image');
      const toAsset = async (pixels: HTMLCanvasElement) => {
        const blob = await new Promise<Blob>((resolve, reject) =>
          pixels.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png'),
        );
        return this.assets.add(blob, target!.samaFileName ?? `${name}.png`);
      };
      /** Points an image layer at new pixels, keeping its geometry. */
      const swapPixels = async (img: FabricImage, asset: { id: string; url: string }) => {
        const { width, height, cropX, cropY } = img;
        await img.setSrc(asset.url);
        img.set({ width, height, cropX, cropY, dirty: true });
        img.samaAssetId = asset.id;
      };

      // The new layer: a copy of the original layer (same geometry, opacity,
      // blend mode, masks…) holding only the selected pixels.
      const parent = (target.parent as Group | undefined) ?? null;
      const json = (parent ? target.toObject() : serializeObject(this.canvas, target)) as Record<string, unknown>;
      const [layer] = (await enlivenObjects([json])) as FabricImage[];
      reassignIds(layer);
      await swapPixels(layer, await toAsset(copied));
      layer.samaName = this.translate(mode === 'cut' ? 'layerName.cut' : 'layerName.copy', { name });
      layer.samaLocked = false;
      layer.visible = true;
      // In a group, the copied geometry is in the group's plane; insertAt expects scene coordinates.
      if (parent) util.applyTransformToObject(layer, util.multiplyTransformMatrices(parent.calcTransformMatrix(), layer.calcOwnMatrix()));
      applyLockState(layer);

      if (mode === 'cut') {
        const remaining = applySelectionToImage(target, selection, sel.scale, 'remove');
        if (remaining) await swapPixels(target, await toAsset(remaining));
      }
      this.insertInto(parent, this.siblingsOf(target).indexOf(target) + 1, layer);
      layer.setCoords();
      for (let p = parent; p; p = (p.parent as Group | undefined) ?? null) p.set('dirty', true);

      this.pixelSelection.clear();
      this.publishPixelSelection();
      this.selectObjects([layer]);
      this.canvas.requestRenderAll();
      this.commit(mode === 'cut' ? 'Cut to new layer' : 'Copy to new layer');
      return layer;
    } finally {
      this.layerViaBusy = false;
    }
  }

  // =========================================================================
  // Artboards
  // =========================================================================

  /** Element holding the canvas (tools attach temporary DOM, e.g. the rename field). */
  get canvasHost(): HTMLElement {
    return this.host;
  }

  /** Localized base name for new artboards ("Artboard" → "Artboard 2"). */
  get artboardLabel(): string {
    const label = this.translate('artboard.defaultName');
    return label === 'artboard.defaultName' ? 'Artboard' : label;
  }

  /** Every artboard, main first (the Artboard tool's live preview while dragging). */
  getArtboards(): ArtboardRect[] {
    return this.artboardPreview ?? listArtboards(this.doc);
  }

  /** Shows `list` instead of the document's artboards until cleared (live drag preview). */
  setArtboardPreview(list: ArtboardRect[] | null) {
    this.artboardPreview = list;
    this.canvas.requestRenderAll();
  }

  /** Top-level layers that belong to an artboard (their centre is on it). */
  artboardContents(id: string, list: ArtboardRect[] = listArtboards(this.doc)): FabricObject[] {
    return this.canvas.getObjects().filter((o) => {
      o.setCoords();
      return owningArtboard(list, o.getBoundingRect())?.id === id;
    });
  }

  /**
   * Stores a new set of artboards (main first) as one undoable step. The
   * main artboard always sits at (0, 0): if it was moved, the rest of the
   * scene (layers, guides, other artboards) is shifted the other way and the
   * view follows, so nothing appears to jump on screen.
   */
  applyArtboards(list: ArtboardRect[], label: string) {
    this.artboardPreview = null;
    const main = list[0];
    const dx = Math.round(main.x);
    const dy = Math.round(main.y);
    const next = list.map((a) => ({
      ...a,
      x: Math.round(a.x) - dx,
      y: Math.round(a.y) - dy,
      width: Math.max(1, Math.min(10000, Math.round(a.width))),
      height: Math.max(1, Math.min(10000, Math.round(a.height))),
    }));
    let guides = this.state.guides;
    if (dx || dy) {
      const active = this.canvas.getActiveObjects();
      this.canvas.discardActiveObject();
      for (const o of this.canvas.getObjects()) {
        o.set({ left: o.left - dx, top: o.top - dy });
        o.setCoords();
      }
      guides = { vertical: guides.vertical.map((x) => x - dx), horizontal: guides.horizontal.map((y) => y - dy) };
      const z = this.canvas.getZoom();
      this.canvas.relativePan(new Point(dx * z, dy * z));
      this.selectObjects(active);
    }
    this.set({ doc: artboardsToDocument(this.doc, next), guides });
    this.onViewportChanged();
    this.commit(label);
  }

  /**
   * Deletes an artboard together with the layers on it (one undoable step).
   * Deleting the main artboard makes the next one the main artboard. The
   * last remaining artboard can't be deleted.
   */
  deleteArtboard(id: string): boolean {
    const list = listArtboards(this.doc);
    if (list.length < 2) {
      this.notify('toast.artboardLast', 'warning');
      return false;
    }
    const contents = this.artboardContents(id, list);
    this.exitTextEditing();
    this.stopPathEditing();
    this.canvas.discardActiveObject();
    this.closeGroups();
    if (contents.length) this.canvas.remove(...contents);
    const rest = list.filter((a) => a.id !== id);
    if (id === MAIN_ARTBOARD_ID) rest[0] = { ...rest[0], id: MAIN_ARTBOARD_ID };
    this.handleSelectionChange();
    this.applyArtboards(rest, 'Delete artboard');
    return true;
  }

  /** Makes the ancestors of `obj` interactive so the child can be transformed on canvas. */
  openGroupsFor(obj: FabricObject) {
    const chain: Group[] = [];
    let p = obj.parent as Group | undefined;
    while (p && !(p instanceof PaintLayer)) {
      chain.push(p);
      p = p.parent as Group | undefined;
    }
    for (const g of this.openedGroups) {
      if (!chain.includes(g)) g.set({ interactive: false, subTargetCheck: false });
    }
    for (const g of chain) {
      g.set({ interactive: true, subTargetCheck: true });
      g.getObjects().forEach((o) => o.setCoords());
    }
    this.openedGroups = chain;
  }

  private closeGroups() {
    this.openedGroups.forEach((g) => g.set({ interactive: false, subTargetCheck: false }));
    this.openedGroups = [];
  }

  private handleSelectionChange() {
    const active = this.canvas.getActiveObjects();
    // Leave groups that no longer contain the selection.
    if (active.length) this.openGroupsFor(active[0]);
    else this.closeGroups();
    if (this.editingPath && !active.includes(this.editingPath)) this.stopPathEditing();
    const ids = active.map((o) => o.samaId).filter((x): x is string => !!x);
    this.set({ selectedIds: ids, selection: this.computeSelectionInfo() });
    this.setHovered(null);
  }

  /** Coalesces selection-info updates to one per animation frame. */
  scheduleSelectionSync() {
    if (this.selectionSyncHandle) return;
    this.selectionSyncHandle = requestAnimationFrame(() => {
      this.selectionSyncHandle = 0;
      this.set({ selection: this.computeSelectionInfo() });
    });
  }

  private computeSelectionInfo(): SelectionInfo | null {
    const active = this.canvas.getActiveObject();
    if (!active) return null;
    const objs = this.canvas.getActiveObjects();
    active.setCoords();
    const bounds = active.getBoundingRect();
    const round = (n: number) => Math.round(n * 100) / 100;
    const base: SelectionInfo = {
      count: objs.length,
      id: objs.length === 1 ? objs[0].samaId ?? null : null,
      kind: objs.length === 1 ? inferKind(objs[0]) : 'multiple',
      name: objs.length === 1 ? objs[0].samaName ?? '' : '',
      x: round(bounds.left),
      y: round(bounds.top),
      width: round(active.width * active.scaleX),
      height: round(active.height * active.scaleY),
      angle: round(active.angle),
      opacity: objs.length === 1 ? objs[0].opacity : 1,
      blendMode: objs.length === 1 ? ((objs[0].globalCompositeOperation as BlendMode) || 'source-over') : 'source-over',
      locked: objs.length === 1 ? isEffectivelyLocked(objs[0]) : false,
      hasAnchors: false,
    };
    if (objs.length !== 1) return base;
    const obj = objs[0];
    const kind = inferKind(obj);
    if (kind === 'paint') {
      const first = (obj as Group).getObjects()[0];
      base.stroke = (first?.stroke as string) ?? null;
    } else if (kind !== 'group' && kind !== 'image') {
      base.fill = typeof obj.fill === 'string' && obj.fill !== '' ? obj.fill : null;
      base.stroke = typeof obj.stroke === 'string' && obj.stroke !== '' ? obj.stroke : null;
      base.strokeWidth = obj.strokeWidth;
    }
    if (obj instanceof Rect) base.cornerRadius = obj.rx ?? 0;
    if (kind === 'polygon') base.sides = obj.samaSides ?? (obj as Polygon).points.length;
    if (obj instanceof IText) {
      base.text = {
        fontFamily: String(obj.fontFamily),
        fontSize: obj.fontSize,
        fontWeight: Number(obj.fontWeight) || 400,
        fontStyle: obj.fontStyle === 'italic' ? 'italic' : 'normal',
        textAlign: obj.textAlign as TextAlign,
        direction: obj.direction === 'rtl' ? 'rtl' : 'ltr',
        lineHeight: obj.lineHeight,
        charSpacing: obj.charSpacing,
      };
    }
    if (obj instanceof FabricImage) {
      const el = obj.getElement() as HTMLImageElement;
      base.image = { naturalWidth: el.naturalWidth || obj.width, naturalHeight: el.naturalHeight || obj.height, fileName: obj.samaFileName };
    }
    base.hasAnchors = isAnchorEditable(obj);
    return base;
  }

  // =========================================================================
  // Direct selection (anchor editing)
  // =========================================================================

  /** Shows anchor/handle controls for a path or polygon. */
  startPathEditing(obj: FabricObject) {
    if (!isAnchorEditable(obj) || isEffectivelyLocked(obj)) return false;
    if (this.editingPath === obj) return true;
    this.stopPathEditing();
    this.editingPath = obj;
    this.editingPathControls = obj.controls;
    obj.controls =
      obj instanceof Polygon
        ? controlsUtils.createPolyControls(obj, { cursorStyle: 'crosshair', sizeX: 9, sizeY: 9 })
        : createAnchorControls(obj as Path);
    obj.set({ hasBorders: false });
    // Recompute control positions for the new control set.
    obj.setCoords();
    this.set({ editingPathId: obj.samaId ?? null });
    this.canvas.requestRenderAll();
    return true;
  }

  stopPathEditing() {
    const obj = this.editingPath;
    if (!obj) return;
    if (this.editingPathControls) obj.controls = this.editingPathControls;
    obj.set({ hasBorders: true });
    obj.setCoords();
    this.editingPath = null;
    this.editingPathControls = null;
    this.set({ editingPathId: null });
    this.canvas.requestRenderAll();
  }

  get pathBeingEdited() {
    return this.editingPath;
  }

  /**
   * Double-click on an anchor while editing a path: toggles it between a
   * corner and a smooth point. Returns true if an anchor was hit.
   */
  toggleAnchorAt(viewportPoint: Point): boolean {
    const obj = this.editingPath;
    if (!(obj instanceof Path)) return false;
    const hit = obj.findControl(viewportPoint);
    const index = hit ? anchorIndexFromControlKey(hit.key) : null;
    if (index === null) return false;
    const structural = toggleAnchorSmooth(obj, index);
    if (structural) {
      // The command list changed shape: rebuild the controls.
      obj.controls = createAnchorControls(obj);
      obj.setCoords();
    }
    this.canvas.requestRenderAll();
    this.commit('Edit anchors');
    return true;
  }

  // =========================================================================
  // Adding objects
  // =========================================================================

  /**
   * Adds a new layer above the current selection (or on top). Objects must be
   * in scene coordinates.
   */
  addLayer(obj: FabricObject, { select = true }: { select?: boolean } = {}) {
    ensureMeta(obj, this.nameFor);
    applyLockState(obj);
    const anchor = this.canvas.getActiveObjects()[0];
    const parent = anchor?.parent as Group | undefined;
    if (anchor && parent && !(parent instanceof PaintLayer) && !(parent instanceof ActiveSelection)) {
      const idx = parent.getObjects().indexOf(anchor);
      parent.insertAt(idx + 1, obj);
    } else if (anchor && !parent) {
      const top = this.topLevelOf(anchor);
      const idx = this.canvas.getObjects().indexOf(top);
      this.canvas.insertAt(idx + 1, obj);
    } else {
      this.canvas.add(obj);
    }
    obj.setCoords();
    if (select) this.selectObjects([obj]);
    this.canvas.requestRenderAll();
  }

  private topLevelOf(obj: FabricObject): FabricObject {
    let cur = obj;
    while (cur.parent) cur = cur.parent as FabricObject;
    return cur;
  }

  /**
   * Adds a brush stroke to the active paint layer, or to a new paint layer
   * created above the current selection (Photoshop-style).
   */
  addBrushStroke(stroke: FabricObject) {
    stroke.samaId = createId('s');
    stroke.erasable = true;
    const active = this.canvas.getActiveObject();
    if (active instanceof PaintLayer && active.visible && !isEffectivelyLocked(active)) {
      active.add(stroke);
      active.setCoords();
      this.canvas.requestRenderAll();
    } else {
      const layer = new PaintLayer([stroke]);
      this.addLayer(layer);
    }
    this.commit('Brush stroke');
  }

  /** Imports image files (from a file picker, drag-and-drop or paste). */
  async importImages(files: File[] | FileList, at?: Point) {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      this.notify('toast.unsupportedFile', 'warning');
      return;
    }
    const added: FabricObject[] = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        const asset = await this.assets.add(file, file.name);
        const img = await FabricImage.fromURL(asset.url);
        const maxW = this.doc.width * 0.9;
        const maxH = this.doc.height * 0.9;
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        img.scale(scale);
        const center = at ?? new Point(this.doc.width / 2, this.doc.height / 2);
        img.setPositionByOrigin(new Point(center.x + i * 20, center.y + i * 20), 'center', 'center');
        img.samaKind = 'image';
        img.samaAssetId = asset.id;
        img.samaFileName = file.name;
        img.samaName = file.name.replace(/\.[^.]+$/, '') || this.nameFor('image');
        img.erasable = true;
        this.addLayer(img, { select: false });
        added.push(img);
      } catch {
        this.notify('toast.imageFailed', 'warning');
      }
    }
    if (added.length) {
      if (this.activeToolId !== 'select') this.setTool('select');
      this.selectObjects(added);
      this.commit(added.length > 1 ? 'Import images' : 'Import image');
    }
  }

  // =========================================================================
  // Editing the selection (properties panel)
  // =========================================================================

  /**
   * Applies property changes to the selection. Pass `commit: false` for
   * continuous edits (slider drags) and call `commit()` when done.
   */
  async updateSelection(patch: SelectionPatch, { commit = true, label = 'Change properties' } = {}) {
    const active = this.canvas.getActiveObject();
    if (!active) return;
    const objs = this.canvas.getActiveObjects();
    const single = objs.length === 1 ? objs[0] : null;

    // Fonts must be loaded before text is re-measured.
    if (single instanceof IText && (patch.fontFamily || patch.fontWeight || patch.fontStyle)) {
      await ensureFontLoaded(
        patch.fontFamily ?? String(single.fontFamily),
        patch.fontWeight ?? single.fontWeight,
        patch.fontStyle ?? single.fontStyle,
      );
    }

    if (single && patch.name !== undefined) single.samaName = patch.name;
    if (single && patch.opacity !== undefined) single.set('opacity', clamp01(patch.opacity));
    if (single && patch.blendMode !== undefined) single.set('globalCompositeOperation', patch.blendMode);

    if (single && (patch.fill !== undefined || patch.stroke !== undefined || patch.strokeWidth !== undefined)) {
      this.applyPaint(single, patch);
    }
    if (single instanceof Rect && patch.cornerRadius !== undefined) {
      const r = Math.max(0, patch.cornerRadius);
      single.set({ rx: r, ry: r });
    }
    if (single instanceof Polygon && patch.sides !== undefined) {
      this.setPolygonSides(single, patch.sides);
    }
    if (single instanceof IText) this.applyTextPatch(single, patch);

    // Geometry last, so it accounts for size changes above.
    if (patch.angle !== undefined) {
      active.rotate(patch.angle);
      active.setCoords();
    }
    if (patch.width !== undefined || patch.height !== undefined) {
      const before = active.getBoundingRect();
      if (patch.width !== undefined && active.width) active.set('scaleX', Math.max(0.01, patch.width) / active.width);
      if (patch.height !== undefined && active.height) active.set('scaleY', Math.max(0.01, patch.height) / active.height);
      active.setCoords();
      const after = active.getBoundingRect();
      this.translateInScene(active, before.left - after.left, before.top - after.top);
    }
    if (patch.x !== undefined || patch.y !== undefined) {
      const r = active.getBoundingRect();
      this.translateInScene(active, patch.x !== undefined ? patch.x - r.left : 0, patch.y !== undefined ? patch.y - r.top : 0);
    }

    active.setCoords();
    if (active instanceof ActiveSelection) objs.forEach((o) => o.setCoords());
    active.parent?.set('dirty', true);
    this.canvas.requestRenderAll();
    if (commit) this.commit(label);
    else this.scheduleSelectionSync();
  }

  private applyPaint(obj: FabricObject, patch: SelectionPatch) {
    if (obj instanceof PaintLayer) {
      // "Colour" of a paint layer recolours all its strokes.
      if (patch.stroke) obj.getObjects().forEach((s) => s.set('stroke', patch.stroke));
      obj.set('dirty', true);
      return;
    }
    if (patch.fill !== undefined) obj.set('fill', patch.fill ?? '');
    if (patch.stroke !== undefined) obj.set('stroke', patch.stroke ?? '');
    if (patch.strokeWidth !== undefined) obj.set('strokeWidth', Math.max(0, patch.strokeWidth));
    if (obj instanceof Path || obj instanceof Polygon) obj.setDimensions?.();
  }

  private applyTextPatch(text: IText, patch: SelectionPatch) {
    const before = text.getBoundingRect();
    const props: Record<string, unknown> = {};
    if (patch.fontFamily !== undefined) props.fontFamily = patch.fontFamily;
    if (patch.fontSize !== undefined) props.fontSize = Math.max(1, patch.fontSize);
    if (patch.fontWeight !== undefined) props.fontWeight = patch.fontWeight;
    if (patch.fontStyle !== undefined) props.fontStyle = patch.fontStyle;
    if (patch.textAlign !== undefined) props.textAlign = patch.textAlign;
    if (patch.lineHeight !== undefined) props.lineHeight = Math.max(0.5, patch.lineHeight);
    if (patch.charSpacing !== undefined) props.charSpacing = patch.charSpacing;
    if (patch.direction !== undefined && patch.direction !== text.direction) {
      props.direction = patch.direction;
      // Mirror the default alignment so the paragraph starts on the reading side.
      if (text.textAlign === 'left' && patch.direction === 'rtl') props.textAlign = 'right';
      if (text.textAlign === 'right' && patch.direction === 'ltr') props.textAlign = 'left';
      props.originX = patch.direction === 'rtl' ? 'right' : 'left';
    }
    if (patch.fill !== undefined && patch.fill) props.fill = patch.fill;
    if (!Object.keys(props).length) return;
    text.set(props);
    text.initDimensions();
    text.setCoords();
    // Keep the text's top-left corner in place (or top-right for RTL).
    const after = text.getBoundingRect();
    const dx = text.direction === 'rtl' ? before.left + before.width - (after.left + after.width) : before.left - after.left;
    this.translateInScene(text, dx, before.top - after.top);
  }

  private setPolygonSides(poly: Polygon, sides: number) {
    const n = Math.max(3, Math.min(64, Math.round(sides)));
    const center = poly.getCenterPoint();
    const w = poly.width;
    const h = poly.height;
    const pts = regularPolygonPoints(n, w / 2, h / 2);
    poly.set({ points: pts });
    poly.setDimensions();
    poly.samaSides = n;
    poly.setPositionByOrigin(center, 'center', 'center');
    poly.setCoords();
  }

  /** Moves an object by a scene-space delta, whatever its parent's transform. */
  translateInScene(obj: FabricObject, dx: number, dy: number) {
    if (!dx && !dy) return;
    let delta = new Point(dx, dy);
    const parent = obj.group ?? obj.parent;
    if (parent) delta = util.sendVectorToPlane(delta, undefined, parent.calcTransformMatrix());
    obj.set({ left: obj.left + delta.x, top: obj.top + delta.y });
    obj.setCoords();
  }

  /** Arrow-key nudge. */
  nudge(dx: number, dy: number) {
    const active = this.canvas.getActiveObject();
    if (!active || isEffectivelyLocked(active)) return;
    this.translateInScene(active, dx, dy);
    this.canvas.requestRenderAll();
    this.commitDebounced('Nudge');
  }

  private commitTimer = 0;
  /** Commits after a short pause (used for repeated key presses). */
  commitDebounced(label: string, delay = 400) {
    this.scheduleSelectionSync();
    window.clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commit(label), delay);
  }

  private flushDebouncedCommit() {
    if (this.commitTimer) {
      window.clearTimeout(this.commitTimer);
      this.commitTimer = 0;
      this.commit('Nudge');
    }
  }

  // =========================================================================
  // Layer operations
  // =========================================================================

  /** Properties toggled from the layers panel. */
  setLayerProps(
    id: string,
    patch: { visible?: boolean; locked?: boolean; opacity?: number; name?: string; blendMode?: BlendMode },
    { commit = true } = {},
  ) {
    const obj = findById(this.canvas, id);
    if (!obj) return;
    let label = 'Layer properties';
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name || name === obj.samaName) return;
      obj.samaName = name;
      obj.samaAutoName = false;
      label = 'Rename layer';
    }
    if (patch.visible !== undefined) {
      obj.set('visible', patch.visible);
      label = patch.visible ? 'Show layer' : 'Hide layer';
      if (!patch.visible && this.canvas.getActiveObjects().some((o) => collectIds(obj).includes(o.samaId ?? ''))) {
        this.canvas.discardActiveObject();
      }
    }
    if (patch.locked !== undefined) {
      obj.samaLocked = patch.locked;
      applyLockState(obj, !!obj.parent && isEffectivelyLocked(obj.parent as FabricObject));
      label = patch.locked ? 'Lock layer' : 'Unlock layer';
      if (patch.locked && this.editingPath && collectIds(obj).includes(this.editingPath.samaId ?? '')) this.stopPathEditing();
    }
    if (patch.opacity !== undefined) {
      obj.set('opacity', clamp01(patch.opacity));
      label = 'Layer opacity';
    }
    if (patch.blendMode !== undefined) {
      obj.set('globalCompositeOperation', patch.blendMode);
      label = 'Blend mode';
    }
    obj.parent?.set('dirty', true);
    this.canvas.requestRenderAll();
    if (commit) this.commit(label);
    else {
      this.syncLayers();
      this.scheduleSelectionSync();
    }
  }

  /** Detaches objects from the current selection so they can be restructured. */
  private takeSelection(): FabricObject[] {
    const objs = this.canvas.getActiveObjects();
    this.stopPathEditing();
    this.canvas.discardActiveObject();
    return objs;
  }

  private removeFromParent(obj: FabricObject) {
    const parent = obj.parent as Group | undefined;
    if (parent) parent.remove(obj);
    else this.canvas.remove(obj);
  }

  private siblingsOf(obj: FabricObject): FabricObject[] {
    const parent = obj.parent as Group | undefined;
    return parent ? parent.getObjects() : this.canvas.getObjects();
  }

  private insertInto(parent: Group | null, index: number, ...objs: FabricObject[]) {
    if (parent) parent.insertAt(index, ...objs);
    else this.canvas.insertAt(index, ...objs);
  }

  deleteSelection() {
    const objs = this.takeSelection().filter((o) => !isEffectivelyLocked(o));
    if (!objs.length) return;
    objs.forEach((o) => this.removeFromParent(o));
    this.canvas.requestRenderAll();
    this.commit(objs.length > 1 ? 'Delete layers' : 'Delete layer');
  }

  async duplicateSelection() {
    const objs = this.canvas.getActiveObjects();
    if (!objs.length) return;
    const json = objs.map((o) => (o.parent ? o.toObject() : serializeObject(this.canvas, o)));
    const sources = this.takeSelection();
    const clones = await enlivenObjects(json);
    clones.forEach((clone, i) => {
      const src = sources[i];
      reassignIds(clone);
      clone.samaName = `${src.samaName ?? kindLabel(inferKind(src))} copy`;
      clone.samaLocked = false;
      const parent = (src.parent as Group | undefined) ?? null;
      const siblings = this.siblingsOf(src);
      // In a group, clone JSON is in the group's plane; move it to scene coords.
      if (parent) util.applyTransformToObject(clone, util.multiplyTransformMatrices(parent.calcTransformMatrix(), clone.calcOwnMatrix()));
      clone.set({ left: clone.left + PASTE_OFFSET, top: clone.top + PASTE_OFFSET });
      applyLockState(clone);
      this.insertInto(parent, siblings.indexOf(src) + 1, clone);
      clone.setCoords();
    });
    this.selectObjects(clones);
    this.canvas.requestRenderAll();
    this.commit('Duplicate');
  }

  /** Alt-drag duplicate: leaves a copy of the dragged objects behind. */
  async leaveCopyBehind(objs: FabricObject[]) {
    const json = objs.map((o) => (o.parent ? o.toObject() : serializeObject(this.canvas, o)));
    const clones = await enlivenObjects(json);
    clones.forEach((clone, i) => {
      const src = objs[i];
      reassignIds(clone);
      const parent = (src.parent as Group | undefined) ?? null;
      if (parent) util.applyTransformToObject(clone, util.multiplyTransformMatrices(parent.calcTransformMatrix(), clone.calcOwnMatrix()));
      // The copy stays below; the dragged original becomes the "new" copy.
      clone.samaName = src.samaName;
      src.samaName = `${src.samaName ?? kindLabel(inferKind(src))} copy`;
      applyLockState(clone);
      const siblings = this.siblingsOf(src);
      this.insertInto(parent, siblings.indexOf(src), clone);
    });
    this.canvas.requestRenderAll();
  }

  groupSelection() {
    const objs = this.canvas.getActiveObjects();
    if (objs.length < 2) {
      if (objs.length === 1) this.notify('toast.groupNeedsTwo');
      return;
    }
    const parent = objs[0].parent as Group | undefined;
    if (objs.some((o) => o.parent !== parent)) {
      this.notify('toast.groupSameParent', 'warning');
      return;
    }
    const siblings = this.siblingsOf(objs[0]);
    const ordered = [...objs].sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));
    const topIndex = siblings.indexOf(ordered[ordered.length - 1]);
    this.takeSelection();
    // Remove in stacking order; afterwards each object is in scene coordinates.
    ordered.forEach((o) => this.removeFromParent(o));
    const group = new Group(ordered);
    ensureMeta(group, this.nameFor);
    applyLockState(group);
    this.insertInto(parent ?? null, topIndex - ordered.length + 1, group);
    this.selectObjects([group]);
    this.commit('Group');
  }

  ungroupSelection() {
    const groups = this.canvas.getActiveObjects().filter((o) => o instanceof Group && !(o instanceof PaintLayer)) as Group[];
    if (!groups.length) return;
    this.takeSelection();
    const released: FabricObject[] = [];
    for (const g of groups) {
      const parent = (g.parent as Group | undefined) ?? null;
      const index = this.siblingsOf(g).indexOf(g);
      g.set({ interactive: false, subTargetCheck: false });
      const children = g.removeAll();
      this.removeFromParent(g);
      // Group opacity/visibility are folded into the children.
      children.forEach((c) => {
        c.set({ opacity: c.opacity * g.opacity, visible: c.visible && g.visible });
        if (g.samaLocked) c.samaLocked = true;
        applyLockState(c);
      });
      this.insertInto(parent, index, ...children);
      released.push(...children);
    }
    this.openedGroups = this.openedGroups.filter((g) => !groups.includes(g));
    this.selectObjects(released.filter((o) => !isEffectivelyLocked(o)));
    this.commit('Ungroup');
  }

  /** Stacking order changes: forward/backward by one, or to front/back. */
  arrange(direction: 'forward' | 'backward' | 'front' | 'back') {
    const objs = this.canvas.getActiveObjects();
    if (!objs.length) return;
    const parent = (objs[0].parent as Group | undefined) ?? null;
    const coll = parent ?? this.canvas;
    const siblings = this.siblingsOf(objs[0]);
    const ordered = [...objs].sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));
    const list = direction === 'forward' || direction === 'front' ? [...ordered].reverse() : ordered;
    const active = this.canvas.getActiveObject();
    this.canvas.discardActiveObject();
    for (const o of list) {
      if (direction === 'forward') coll.bringObjectForward(o);
      else if (direction === 'backward') coll.sendObjectBackwards(o);
      else if (direction === 'front') coll.bringObjectToFront(o);
      else coll.sendObjectToBack(o);
    }
    if (active) this.selectObjects(objs);
    parent?.set('dirty', true);
    this.canvas.requestRenderAll();
    this.commit('Arrange');
  }

  /**
   * Moves layers (layers-panel drag and drop).
   * @param ids layers to move, in any order
   * @param targetParentId group to move into, or null for the top level
   * @param index position in the target's stacking order (0 = bottom),
   *   computed *before* the moved layers are removed.
   */
  moveLayers(ids: string[], targetParentId: string | null, index: number) {
    const target = targetParentId ? findById(this.canvas, targetParentId) : null;
    if (targetParentId && !(target instanceof Group && !(target instanceof PaintLayer))) return;
    let objs = ids.map((id) => findById(this.canvas, id)).filter((o): o is FabricObject => !!o);
    // Can't move a group into itself or its descendants.
    objs = objs.filter((o) => !(target && (target === o || target.isDescendantOf(o))));
    // If both a group and its child are selected, move the group only.
    objs = objs.filter((o) => !objs.some((p) => p !== o && o.isDescendantOf(p)));
    if (!objs.length) return;

    const targetGroup = (target as Group | null) ?? null;
    const targetSiblings = targetGroup ? targetGroup.getObjects() : this.canvas.getObjects();
    // Keep the relative stacking order of the moved layers.
    objs.sort((a, b) => this.siblingsOf(a).indexOf(a) - this.siblingsOf(b).indexOf(b));
    // Adjust the insertion index for layers removed from below it.
    let insertAt = index;
    for (const o of objs) {
      const i = targetSiblings.indexOf(o);
      if (i > -1 && i < index) insertAt--;
    }
    this.takeSelection();
    objs.forEach((o) => this.removeFromParent(o));
    const max = targetGroup ? targetGroup.getObjects().length : this.canvas.getObjects().length;
    insertAt = Math.max(0, Math.min(max, insertAt));
    objs.forEach((o) => applyLockState(o, targetGroup ? isEffectivelyLocked(targetGroup) : false));
    this.insertInto(targetGroup, insertAt, ...objs);
    this.selectObjects(objs);
    this.canvas.requestRenderAll();
    this.commit('Move layer');
  }

  /** Adds an empty paint layer (the next brush strokes go into it). */
  addPaintLayer() {
    const layer = new PaintLayer([]);
    this.addLayer(layer);
    this.commit('New paint layer');
  }

  /**
   * Aligns the selection. A single layer aligns to the artboard; several
   * layers align to their combined bounds.
   */
  alignSelection(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const objs = this.canvas.getActiveObjects().filter((o) => !isEffectivelyLocked(o));
    if (!objs.length) return;
    const active = this.canvas.getActiveObject()!;
    const ref =
      objs.length === 1
        ? { left: 0, top: 0, width: this.doc.width, height: this.doc.height }
        : active.getBoundingRect();
    const targets = objs.length === 1 ? [active] : objs;
    for (const o of targets) {
      o.setCoords();
      const r = o.getBoundingRect();
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = ref.left - r.left;
      if (mode === 'hcenter') dx = ref.left + ref.width / 2 - (r.left + r.width / 2);
      if (mode === 'right') dx = ref.left + ref.width - (r.left + r.width);
      if (mode === 'top') dy = ref.top - r.top;
      if (mode === 'vcenter') dy = ref.top + ref.height / 2 - (r.top + r.height / 2);
      if (mode === 'bottom') dy = ref.top + ref.height - (r.top + r.height);
      this.translateInScene(o, dx, dy);
    }
    if (objs.length > 1) this.selectObjects(objs); // recompute selection bounds
    this.canvas.requestRenderAll();
    this.commit('Align');
  }

  flipSelection(axis: 'x' | 'y') {
    const active = this.canvas.getActiveObject();
    if (!active || isEffectivelyLocked(active)) return;
    if (axis === 'x') active.set('flipX', !active.flipX);
    else active.set('flipY', !active.flipY);
    active.setCoords();
    this.canvas.requestRenderAll();
    this.commit(axis === 'x' ? 'Flip horizontal' : 'Flip vertical');
  }

  /** Converts rectangles, ellipses and polygons into editable paths. */
  convertSelectionToPath() {
    const objs = this.canvas.getActiveObjects().filter((o) => pathDataFor(o) && !isEffectivelyLocked(o));
    if (!objs.length) return;
    this.takeSelection();
    const created: FabricObject[] = [];
    for (const obj of objs) {
      const d = pathDataFor(obj)!;
      const path = new Path(d, {
        fill: obj.fill,
        stroke: obj.stroke,
        strokeWidth: obj.strokeWidth,
        strokeUniform: obj.strokeUniform,
        strokeLineJoin: obj.strokeLineJoin,
        strokeDashArray: obj.strokeDashArray,
        opacity: obj.opacity,
        globalCompositeOperation: obj.globalCompositeOperation,
        visible: obj.visible,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
        flipX: obj.flipX,
        flipY: obj.flipY,
        skewX: obj.skewX,
        skewY: obj.skewY,
        clipPath: obj.clipPath,
        shadow: obj.shadow,
      });
      path.samaId = obj.samaId;
      path.samaName = obj.samaName;
      path.samaKind = 'path';
      path.setPositionByOrigin(obj.getRelativeCenterPoint(), 'center', 'center');
      const parent = (obj.parent as Group | undefined) ?? null;
      const index = this.siblingsOf(obj).indexOf(obj);
      // Insert first, then remove: keeps the parent group's layout stable.
      if (parent) {
        parent.remove(obj);
        const m = parent.calcTransformMatrix();
        util.applyTransformToObject(path, util.multiplyTransformMatrices(m, path.calcOwnMatrix()));
      } else this.canvas.remove(obj);
      this.insertInto(parent, index, path);
      path.setCoords();
      created.push(path);
    }
    this.selectObjects(created);
    this.commit('Convert to path');
  }

  /** Changes the artboard size, keeping the artwork centred (like Photoshop's canvas size). */
  resizeArtboard(width: number, height: number) {
    const w = Math.max(1, Math.min(10000, Math.round(width)));
    const h = Math.max(1, Math.min(10000, Math.round(height)));
    const dx = (w - this.doc.width) / 2;
    const dy = (h - this.doc.height) / 2;
    if (!dx && !dy) return;
    const active = this.canvas.getActiveObjects();
    this.canvas.discardActiveObject();
    for (const o of this.canvas.getObjects()) {
      o.set({ left: o.left + dx, top: o.top + dy });
      o.setCoords();
    }
    const g = this.state.guides;
    const doc: DocumentSettings = { ...this.doc, width: w, height: h };
    // Other artboards stay with their artwork.
    if (doc.artboards) doc.artboards = doc.artboards.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy }));
    this.set({
      doc,
      guides: { vertical: g.vertical.map((x) => x + dx), horizontal: g.horizontal.map((y) => y + dy) },
    });
    this.selectObjects(active);
    this.fitToScreen();
    this.commit('Canvas size');
  }

  /**
   * Crops the artboard to `rect` (artboard coordinates), like Photoshop's crop:
   * layers entirely outside the rectangle are deleted, layers crossing its edge
   * are trimmed to it, and the artboard is resized to the rectangle with its
   * top-left corner becoming the new origin. Applies to every layer, including
   * hidden and locked ones, and is recorded as one undoable step.
   */
  cropArtboard(rect: { x: number; y: number; w: number; h: number }) {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.max(1, Math.min(10000, Math.round(rect.w)));
    const h = Math.max(1, Math.min(10000, Math.round(rect.h)));
    const box = { x, y, w, h };
    this.exitTextEditing();
    this.stopPathEditing();
    this.canvas.discardActiveObject();
    this.closeGroups();

    for (const obj of [...this.canvas.getObjects()]) {
      if (this.cropLayer(obj, box) === 'remove') this.canvas.remove(obj);
    }
    // The crop's top-left corner becomes the artboard origin.
    for (const obj of this.canvas.getObjects()) {
      obj.set({ left: obj.left - x, top: obj.top - y });
      obj.setCoords();
    }
    const g = this.state.guides;
    // Everything outside the crop is discarded — other artboards included.
    const { artboards: _dropped, ...docRest } = this.doc;
    void _dropped;
    this.set({
      doc: { ...docRest, width: w, height: h },
      guides: {
        vertical: g.vertical.map((v) => v - x).filter((v) => v >= 0 && v <= w),
        horizontal: g.horizontal.map((v) => v - y).filter((v) => v >= 0 && v <= h),
      },
    });
    this.handleSelectionChange();
    this.fitToScreen();
    this.commit('Crop');
  }

  /**
   * Crops one layer. Returns 'remove' when nothing of it remains inside the
   * crop box. Groups (and paint layers) are cropped child by child, so what's
   * removed stays removed even if children are moved or added later.
   */
  private cropLayer(obj: FabricObject, box: { x: number; y: number; w: number; h: number }): 'keep' | 'remove' {
    obj.setCoords();
    const r = obj.getBoundingRect();
    const outside = r.left >= box.x + box.w || r.left + r.width <= box.x || r.top >= box.y + box.h || r.top + r.height <= box.y;
    if (outside) return 'remove';
    const inside = r.left >= box.x && r.top >= box.y && r.left + r.width <= box.x + box.w && r.top + r.height <= box.y + box.h;
    if (inside) return 'keep';
    if (obj instanceof Group) {
      for (const child of [...obj.getObjects()]) {
        if (this.cropLayer(child, box) === 'remove') obj.remove(child);
      }
      obj.set('dirty', true);
      return obj.getObjects().length ? 'keep' : 'remove';
    }
    this.trimToBox(obj, box);
    return 'keep';
  }

  /**
   * Hides the part of a layer outside the crop box with a clip mask stored in
   * the layer's own coordinates (so the trimmed edge travels with the layer).
   */
  private trimToBox(obj: FabricObject, box: { x: number; y: number; w: number; h: number }) {
    const toLocal = util.invertTransform(obj.calcTransformMatrix());
    const corners = [
      [box.x, box.y],
      [box.x + box.w, box.y],
      [box.x + box.w, box.y + box.h],
      [box.x, box.y + box.h],
    ].map(([px, py]) => new Point(px, py).transform(toLocal));
    const mask = new Polygon(corners, { fill: '#000000', stroke: '', strokeWidth: 0 });
    if (!obj.clipPath) {
      obj.clipPath = mask;
    } else if (obj.clipPath instanceof ClippingGroup) {
      // Already erased: intersect the eraser mask with the crop area.
      obj.clipPath.add(mask);
      obj.clipPath.set('dirty', true);
    } else {
      // No other kind of clip mask is created by the workspace. Leave such a
      // layer as is: its outside part is off the artboard and not exported.
      return;
    }
    obj.set('dirty', true);
  }

  /**
   * Perspective crop: straightens the quadrilateral `quad` (artboard
   * coordinates; corners top-left, top-right, bottom-right, bottom-left) into
   * a rectangle, crops the document to it and resizes the artboard. Every
   * layer inside is warped and becomes an image layer (see perspectiveCrop.ts);
   * layers outside are removed. One undoable step. Returns false if the shape
   * can't be corrected.
   */
  async perspectiveCropArtboard(quad: XY[]): Promise<boolean> {
    if (!isValidQuad(quad)) {
      this.notify('toast.perspectiveInvalid', 'warning');
      return false;
    }
    const size = correctedSize(quad);
    const width = Math.min(8000, size.width);
    const height = Math.min(8000, size.height);
    this.exitTextEditing();
    this.stopPathEditing();
    this.canvas.discardActiveObject();
    this.closeGroups();
    const layers = await perspectiveWarpLayers({
      canvas: this.canvas,
      assets: this.assets,
      objects: [...this.canvas.getObjects()],
      quad,
      width,
      height,
    });
    this.canvas.remove(...this.canvas.getObjects());
    layers.forEach((o) => applyLockState(o));
    if (layers.length) this.canvas.add(...layers);
    // Guides can't follow a perspective change, so they are cleared.
    // Everything outside the crop is discarded — other artboards included.
    const { artboards: _dropped, ...docRest } = this.doc;
    void _dropped;
    this.set({ doc: { ...docRest, width, height }, guides: { vertical: [], horizontal: [] } });
    this.handleSelectionChange();
    this.fitToScreen();
    this.commit('Perspective crop');
    return true;
  }

  // =========================================================================
  // Clipboard
  // =========================================================================

  copySelection() {
    const objs = this.canvas.getActiveObjects();
    if (!objs.length) return false;
    this.clipboard = {
      objects: objs.map((o) => {
        if (!o.parent) return serializeObject(this.canvas, o);
        // A child of a group: bake the group's transform in (scene coordinates)
        // so the pasted copy lands where the original is.
        const d = util.qrDecompose(o.calcTransformMatrix());
        return {
          ...o.toObject(),
          left: d.translateX,
          top: d.translateY,
          scaleX: d.scaleX,
          scaleY: d.scaleY,
          angle: d.angle,
          skewX: d.skewX,
          skewY: 0,
          originX: 'center',
          originY: 'center',
        };
      }),
      pasteCount: 0,
    };
    return true;
  }

  cutSelection() {
    if (this.copySelection()) this.deleteSelection();
  }

  hasClipboard() {
    return !!this.clipboard?.objects.length;
  }

  async paste() {
    if (!this.clipboard) return;
    this.clipboard.pasteCount++;
    const offset = PASTE_OFFSET * this.clipboard.pasteCount;
    const objs = await enlivenObjects(this.clipboard.objects);
    this.takeSelection();
    for (const o of objs) {
      reassignIds(o);
      o.samaLocked = false;
      o.set({ left: o.left + offset, top: o.top + offset });
      applyLockState(o);
      this.canvas.add(o);
      o.setCoords();
    }
    this.selectObjects(objs);
    this.commit('Paste');
  }

  // =========================================================================
  // Text
  // =========================================================================

  private handleTextEditExit(text: IText) {
    this.set({ isEditingText: false });
    // Like Photoshop, text layers are named after their content until renamed.
    if (text.samaAutoName && text.text.trim()) {
      const line = text.text.trim().split('\n')[0];
      text.samaName = line.length > 32 ? `${line.slice(0, 31)}…` : line;
    }
    if (!text.text.trim()) {
      // Empty text boxes are removed, like in Photoshop/Illustrator.
      this.removeFromParent(text);
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
    }
    this.commit(text.text.trim() ? 'Edit text' : 'Delete empty text');
  }

  /** Exits text editing if active (commits the edit). */
  exitTextEditing() {
    const active = this.canvas.getActiveObject();
    if (active instanceof IText && active.isEditing) active.exitEditing();
  }

  // =========================================================================
  // Document
  // =========================================================================

  setDocument(patch: Partial<DocumentSettings>, { commit = true } = {}) {
    const next = { ...this.doc, ...patch };
    if (patch.width !== undefined) next.width = Math.max(1, Math.min(10000, Math.round(patch.width)));
    if (patch.height !== undefined) next.height = Math.max(1, Math.min(10000, Math.round(patch.height)));
    this.set({ doc: next });
    this.canvas.requestRenderAll();
    if (commit) this.commit('Document settings');
  }

  // Guides are view aids: not part of the undo history (like Figma).
  addGuide(orientation: 'vertical' | 'horizontal', value: number) {
    const g = this.state.guides;
    const key = orientation === 'vertical' ? 'vertical' : 'horizontal';
    this.set({ guides: { ...g, [key]: [...g[key], Math.round(value)] }, showGuides: true });
    this.canvas.requestRenderAll();
    return g[key].length;
  }

  moveGuide(orientation: 'vertical' | 'horizontal', index: number, value: number) {
    const g = this.state.guides;
    const key = orientation === 'vertical' ? 'vertical' : 'horizontal';
    const list = [...g[key]];
    list[index] = Math.round(value);
    this.set({ guides: { ...g, [key]: list } });
    this.canvas.requestRenderAll();
  }

  removeGuide(orientation: 'vertical' | 'horizontal', index: number) {
    const g = this.state.guides;
    const key = orientation === 'vertical' ? 'vertical' : 'horizontal';
    this.set({ guides: { ...g, [key]: g[key].filter((_, i) => i !== index) } });
    this.canvas.requestRenderAll();
  }

  clearGuides() {
    this.set({ guides: { vertical: [], horizontal: [] } });
    this.canvas.requestRenderAll();
  }

  /** Finds a guide near a viewport point (for dragging guides on canvas). */
  hitTestGuide(viewportPoint: { x: number; y: number }): { orientation: 'vertical' | 'horizontal'; index: number } | null {
    if (!this.state.showGuides) return null;
    const v = this.canvas.viewportTransform;
    const tol = 4;
    const { vertical, horizontal } = this.state.guides;
    for (let i = vertical.length - 1; i >= 0; i--) {
      if (Math.abs(vertical[i] * v[0] + v[4] - viewportPoint.x) <= tol) return { orientation: 'vertical', index: i };
    }
    for (let i = horizontal.length - 1; i >= 0; i--) {
      if (Math.abs(horizontal[i] * v[3] + v[5] - viewportPoint.y) <= tol) return { orientation: 'horizontal', index: i };
    }
    return null;
  }

  toggleView(key: 'showRulers' | 'showGuides' | 'snapping') {
    this.set({ [key]: !this.state[key] } as Partial<WorkspaceState>);
    this.canvas.requestRenderAll();
  }

  // =========================================================================
  // History
  // =========================================================================

  private takeSnapshot(label: string): Snapshot {
    return {
      label,
      doc: { ...this.doc },
      objects: this.canvas.getObjects().map((o) => ({
        id: o.samaId ?? '',
        json: JSON.stringify(serializeObject(this.canvas, o)),
      })),
      selection: [...this.state.selectedIds],
    };
  }

  /** Records the current state as an undoable step. */
  commit(label: string) {
    if (this.restoring || this.disposed) return;
    window.clearTimeout(this.commitTimer);
    this.commitTimer = 0;
    // Make sure every object carries metadata before it is recorded.
    this.canvas.getObjects().forEach((o) => ensureMeta(o, this.nameFor));
    const changed = this.history.push(this.takeSnapshot(label));
    this.syncLayers();
    this.syncHistory();
    this.scheduleSelectionSync();
    if (changed) this.onChange?.();
  }

  private restoreQueue: Promise<void> = Promise.resolve();

  undo() {
    this.flushDebouncedCommit();
    // Let tools with in-progress work (e.g. the pen tool) undo their last step first.
    if (this.tool.id === 'pen' && this.getTool<PenTool>('pen').undoLastAnchor()) return;
    if (this.state.isEditingText) return;
    const snap = this.history.undo();
    if (snap) this.enqueueRestore(snap);
  }

  redo() {
    if (this.state.isEditingText) return;
    const snap = this.history.redo();
    if (snap) this.enqueueRestore(snap);
  }

  goToHistory(position: number) {
    const snap = this.history.goTo(position);
    if (snap) this.enqueueRestore(snap);
  }

  private enqueueRestore(snap: Snapshot) {
    this.syncHistory();
    this.restoreQueue = this.restoreQueue.then(() => this.restoreSnapshot(snap)).catch((err) => console.error('[sama] restore failed', err));
  }

  /**
   * Makes the canvas match a snapshot. Objects whose serialized form is
   * unchanged are reused as-is; only changed ones are re-created.
   */
  private async restoreSnapshot(snap: Snapshot) {
    this.restoring = true;
    try {
      this.exitTextEditing();
      this.stopPathEditing();
      this.canvas.discardActiveObject();
      this.closeGroups();
      const live = new Map(this.canvas.getObjects().map((o) => [o.samaId, o]));
      const result: FabricObject[] = new Array(snap.objects.length);
      const pending: { index: number; json: string }[] = [];
      snap.objects.forEach((so, i) => {
        const obj = live.get(so.id);
        if (obj && JSON.stringify(serializeObject(this.canvas, obj)) === so.json) result[i] = obj;
        else pending.push({ index: i, json: so.json });
      });
      const created = await enlivenObjects(pending.map((p) => JSON.parse(p.json)));
      created.forEach((obj, k) => {
        applyLockState(obj);
        result[pending[k].index] = obj;
      });
      this.canvas.remove(...this.canvas.getObjects());
      this.canvas.add(...result);
      this.set({ doc: { ...snap.doc } });
      const selectable = snap.selection
        .map((id) => findById(this.canvas, id))
        .filter((o): o is FabricObject => !!o && o.visible);
      this.selectObjects(selectable);
      this.canvas.requestRenderAll();
    } finally {
      this.restoring = false;
    }
    this.syncLayers();
    this.syncHistory();
    this.scheduleSelectionSync();
    this.onChange?.();
  }

  // =========================================================================
  // Store sync
  // =========================================================================

  syncLayers() {
    this.set({ layers: buildLayerTree(this.canvas.getObjects()) });
  }

  private syncHistory() {
    const h = this.history;
    this.set({ history: { labels: h.labels, position: h.position, canUndo: h.canUndo, canRedo: h.canRedo } });
  }

  private syncAll() {
    this.syncLayers();
    this.syncHistory();
    this.set({ selection: this.computeSelectionInfo(), zoom: this.canvas.getZoom() });
  }

  // =========================================================================
  // Serialization, import/export
  // =========================================================================

  /** The complete structured document (layers + analysis + exact scene). */
  async getDocument(): Promise<SamaDocument> {
    this.exitTextEditing();
    const objects = this.canvas.getObjects();
    const raw = objects.map((o) => serializeObject(this.canvas, o));
    const assets = await this.assets.serialize(collectAssetIds(raw));
    const fabricObjects = rewriteImageSources(raw, (id) => assets[id]?.dataUrl);
    const layers = [...objects].reverse().map((o) => describeLayer(o, this.doc));
    return {
      format: DOCUMENT_FORMAT,
      version: DOCUMENT_VERSION,
      generator: `sama-workspace@${WORKSPACE_VERSION}`,
      exportedAt: new Date().toISOString(),
      document: { ...this.doc, units: 'px' },
      guides: structuredClone(this.state.guides),
      layers,
      analysis: analyze(layers),
      assets,
      fabric: { version: fabricVersion, objects: fabricObjects },
    };
  }

  /** Loads a document previously produced by `getDocument()`. */
  async loadDocument(docData: SamaDocument) {
    if (docData?.format !== DOCUMENT_FORMAT) throw new Error('Not a Sama design document');
    if (docData.version > DOCUMENT_VERSION) throw new Error('This document was created by a newer version of the workspace');
    this.restoring = true;
    try {
      this.exitTextEditing();
      this.stopPathEditing();
      this.canvas.discardActiveObject();
      const urls = await this.assets.load(docData.assets ?? {});
      const objs = await enlivenObjects(rewriteImageSources(docData.fabric.objects, (id) => urls.get(id)));
      // Preload fonts so text is measured correctly.
      const fonts = new Set<string>();
      walkLayers(objs, (o) => {
        if (o instanceof IText) fonts.add(`${o.fontFamily}|${o.fontWeight}|${o.fontStyle}`);
      });
      await Promise.all([...fonts].map((f) => ensureFontLoaded(...(f.split('|') as [string, string, string]))));
      walkLayers(objs, (o) => {
        if (o instanceof IText) o.initDimensions();
      });
      this.canvas.remove(...this.canvas.getObjects());
      objs.forEach((o) => {
        ensureMeta(o, this.nameFor);
        applyLockState(o);
      });
      this.canvas.add(...objs);
      const { units: _units, ...docSettings } = docData.document;
      void _units;
      this.set({ doc: docSettings, guides: docData.guides ?? { vertical: [], horizontal: [] } });
      this.clearPixelSelection();
      this.resetNameCounters();
    } finally {
      this.restoring = false;
    }
    this.history.reset(this.takeSnapshot('Open document'));
    this.syncAll();
    this.fitToScreen();
    this.onChange?.();
  }

  /** Clears the canvas and starts a new document. */
  newDocument(settings: Partial<DocumentSettings> = {}) {
    this.exitTextEditing();
    this.stopPathEditing();
    this.canvas.discardActiveObject();
    this.canvas.remove(...this.canvas.getObjects());
    const { artboards: _old, ...docRest } = this.doc;
    void _old;
    this.set({ doc: { ...docRest, ...settings }, guides: { vertical: [], horizontal: [] } });
    this.clearPixelSelection();
    this.nameCounters = {};
    this.history.reset(this.takeSnapshot('New document'));
    this.syncAll();
    this.fitToScreen();
    this.onChange?.();
  }

  private resetNameCounters() {
    const counters: Partial<Record<LayerKind, number>> = {};
    walkLayers(this.canvas.getObjects(), (o) => {
      const k = inferKind(o);
      counters[k] = (counters[k] ?? 0) + 1;
    });
    this.nameCounters = counters;
  }

  /** Renders the artboard to a PNG blob. */
  async exportPng(options: PngOptions = {}): Promise<Blob> {
    this.exitTextEditing();
    const raw = this.canvas.getObjects().map((o) => serializeObject(this.canvas, o));
    return renderPng(this.doc, raw, options);
  }

  // =========================================================================
  // Keyboard
  // =========================================================================

  /**
   * Handles a keydown event routed from the workspace. Returns true when the
   * event was consumed (the caller then prevents the browser default).
   */
  handleKeyDown(e: KeyboardEvent): boolean {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const key = e.key;
    // Physical key (layout-independent) so shortcuts also work with an
    // Arabic keyboard layout, where e.g. the V key types "ر".
    const lower = shortcutKey(e);

    // While typing in a text object, only Escape (finish editing) is ours.
    if (this.state.isEditingText) {
      if (key === 'Escape') {
        this.exitTextEditing();
        return true;
      }
      return false;
    }

    if (this.tool.onKeyDown(e)) return true;

    // Space: temporary hand tool.
    if ((key === ' ' || e.code === 'Space') && !mod) {
      if (!e.repeat) this.beginSpringTool('hand');
      return true;
    }

    if (mod) {
      switch (lower) {
        case 'z':
          if (e.shiftKey) this.redo();
          else this.undo();
          return true;
        case 'y':
          this.redo();
          return true;
        case 'a':
          if (e.shiftKey) {
            this.clearSelection();
            this.clearPixelSelection();
          } else if (this.tool.selectsRegion) {
            // With a marquee/lasso tool, Select All selects the whole artboard area.
            this.selectRegion({ type: 'rect', x: 0, y: 0, w: this.doc.width, h: this.doc.height }, 'replace');
          } else this.selectAll();
          return true;
        case 'c':
          this.copySelection();
          return true;
        case 'x':
          this.cutSelection();
          return true;
        case 'j':
          // With a region selection: Copy to New Layer (Ctrl+J) / Cut to New
          // Layer (Shift+Ctrl+J), like Photoshop. Without one: duplicate.
          if (!this.pixelSelection.isEmpty) {
            void this.layerViaSelection(e.shiftKey ? 'cut' : 'copy');
            return true;
          }
          void this.duplicateSelection();
          return true;
        case 'd':
          void this.duplicateSelection();
          return true;
        case 'g':
          if (e.shiftKey) this.ungroupSelection();
          else this.groupSelection();
          return true;
        case ']':
          this.arrange(e.shiftKey ? 'front' : 'forward');
          return true;
        case '[':
          this.arrange(e.shiftKey ? 'back' : 'backward');
          return true;
        case '=':
        case '+':
          this.zoomStep(1);
          return true;
        case '-':
        case '_':
          this.zoomStep(-1);
          return true;
        case '0':
          this.fitToScreen();
          return true;
        case '1':
          this.zoomToActualSize();
          return true;
        case '2':
          this.zoomToSelection();
          return true;
        case 'r':
          this.toggleView('showRulers');
          return true;
        case ';':
          this.toggleView('showGuides');
          return true;
      }
      return false;
    }

    // Unmodified keys
    switch (key) {
      case 'Delete':
      case 'Backspace':
        this.deleteSelection();
        return true;
      case 'Escape':
        if (this.editingPath) {
          this.stopPathEditing();
          if (this.activeToolId === 'direct') this.setTool('select');
        } else this.clearSelection();
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        const step = e.shiftKey ? NUDGE_BIG : NUDGE;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        this.nudge(dx, dy);
        return true;
      }
      case 'Enter':
        if (this.tool.id === 'select') {
          const active = this.canvas.getActiveObject();
          if (active instanceof IText) {
            active.enterEditing();
            active.selectAll();
            return true;
          }
          if (active && isAnchorEditable(active)) {
            this.setTool('direct');
            this.startPathEditing(active);
            return true;
          }
        }
        return false;
    }

    const toolKeys: Record<string, ToolId> = {
      v: 'select',
      a: 'direct',
      h: 'hand',
      z: 'zoom',
      b: 'brush',
      e: 'eraser',
      p: 'pen',
      t: 'text',
      m: 'rect',
      l: 'ellipse',
      '\\': 'line',
      c: 'crop',
      i: 'eyedropper',
      o: 'colorSampler',
      r: 'ruler',
      n: 'count',
      j: 'spotHealingBrush',
      q: 'lasso',
      w: 'objectSelection',
      y: 'magicWand',
    };
    // Shift+letter tools (the plain letter belongs to a sibling tool).
    const shiftToolKeys: Record<string, ToolId> = {
      j: 'healingBrush', // J = Spot Healing Brush, as in Photoshop
      c: 'perspectiveCrop', // C = Crop
      v: 'groupSelection', // V = Selection
      o: 'artboard', // O = Color Sampler; Shift+O = Artboard, as in Illustrator
      l: 'polygonalLasso', // L = Ellipse; the Lasso is Q (Illustrator)
      w: 'quickSelection', // W = Object Selection
    };
    // Alt+Shift+L: Magnetic Lasso.
    if (lower === 'l' && e.shiftKey && e.altKey) {
      this.setTool('magneticLasso');
      return true;
    }
    // Shift+M: Rectangular Marquee; pressed again, it switches to the
    // Elliptical Marquee and back (Photoshop's Shift+M cycling). Plain M is
    // the Rectangle shape tool.
    if (lower === 'm' && e.shiftKey && !e.altKey) {
      this.setTool(this.activeToolId === 'rectMarquee' ? 'ellipseMarquee' : 'rectMarquee');
      return true;
    }
    if (e.shiftKey && !e.altKey && shiftToolKeys[lower]) {
      this.setTool(shiftToolKeys[lower]);
      return true;
    }
    if (!e.altKey && toolKeys[lower]) {
      this.setTool(toolKeys[lower]);
      return true;
    }
    if (lower === 'u' && !e.altKey) {
      // U cycles through the shape tools (Photoshop convention).
      const cycle: ToolId[] = ['rect', 'ellipse', 'line', 'polygon'];
      const i = cycle.indexOf(this.activeToolId);
      this.setTool(cycle[(i + 1) % cycle.length]);
      return true;
    }
    if (lower === '[' || lower === ']') {
      this.adjustBrushSize(lower === ']' ? 1 : -1);
      return true;
    }
    return false;
  }

  handleKeyUp(e: KeyboardEvent): boolean {
    if (e.key === ' ' || e.code === 'Space') {
      this.endSpringTool();
      return true;
    }
    return false;
  }

  /** Called when the window loses focus: release spring-loaded tools. */
  handleBlur() {
    this.endSpringTool();
  }

  /** `[` / `]` resize the brush, eraser, healing or quick-selection brush (Photoshop convention). */
  adjustBrushSize(direction: 1 | -1) {
    const tool =
      this.activeToolId === 'eraser'
        ? 'eraser'
        : this.activeToolId === 'spotHealingBrush' || this.activeToolId === 'healingBrush'
          ? 'spotHealingBrush' // both healing brushes share one size
          : this.activeToolId === 'quickSelection'
            ? 'quickSelection'
            : 'brush';
    const size = this.toolOptions[tool].size;
    const step = size < 10 ? 1 : size < 50 ? 5 : size < 100 ? 10 : 25;
    this.updateToolOptions(tool, { size: Math.max(1, Math.min(500, size + direction * step)) });
  }

  /** Walks all layer objects (used by tests and the host platform). */
  forEachLayer(fn: (obj: FabricObject) => void) {
    walkLayers(this.canvas.getObjects(), (o) => fn(o));
  }
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}


/** Path data (in the object's own centred coordinates) for convertible shapes. */
function pathDataFor(obj: FabricObject): string | null {
  const k = 0.5522847498; // cubic Bézier circle constant
  if (obj instanceof Rect) {
    const w = obj.width / 2;
    const h = obj.height / 2;
    const rx = Math.min(obj.rx ?? 0, w);
    const ry = Math.min(obj.ry ?? 0, h);
    if (!rx || !ry) return `M ${-w} ${-h} L ${w} ${-h} L ${w} ${h} L ${-w} ${h} Z`;
    const cx = rx * k;
    const cy = ry * k;
    return [
      `M ${-w + rx} ${-h}`,
      `L ${w - rx} ${-h}`,
      `C ${w - rx + cx} ${-h} ${w} ${-h + ry - cy} ${w} ${-h + ry}`,
      `L ${w} ${h - ry}`,
      `C ${w} ${h - ry + cy} ${w - rx + cx} ${h} ${w - rx} ${h}`,
      `L ${-w + rx} ${h}`,
      `C ${-w + rx - cx} ${h} ${-w} ${h - ry + cy} ${-w} ${h - ry}`,
      `L ${-w} ${-h + ry}`,
      `C ${-w} ${-h + ry - cy} ${-w + rx - cx} ${-h} ${-w + rx} ${-h}`,
      'Z',
    ].join(' ');
  }
  if (obj instanceof Ellipse) {
    const a = obj.rx;
    const b = obj.ry;
    const ca = a * k;
    const cb = b * k;
    return [
      `M 0 ${-b}`,
      `C ${ca} ${-b} ${a} ${-cb} ${a} 0`,
      `C ${a} ${cb} ${ca} ${b} 0 ${b}`,
      `C ${-ca} ${b} ${-a} ${cb} ${-a} 0`,
      `C ${-a} ${-cb} ${-ca} ${-b} 0 ${-b}`,
      'Z',
    ].join(' ');
  }
  if (obj instanceof Polygon) {
    const o = obj.pathOffset;
    return 'M ' + obj.points.map((p) => `${p.x - o.x} ${p.y - o.y}`).join(' L ') + ' Z';
  }
  return null;
}

const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Equal: '=',
  Minus: '-',
  Semicolon: ';',
  Backslash: '\\',
  IntlBackslash: '\\',
  Slash: '/',
  NumpadAdd: '+',
  NumpadSubtract: '-',
};

/**
 * Normalized shortcut key for an event: letters/digits come from the physical
 * key (`e.code`), so shortcuts don't depend on the active keyboard layout.
 */
export function shortcutKey(e: KeyboardEvent): string {
  const code = e.code ?? '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1);
  if (CODE_KEYS[code]) return CODE_KEYS[code];
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}
