/**
 * Base class for canvas tools.
 *
 * The Editor forwards Fabric pointer events to the active tool. Each tool
 * decides how the canvas behaves while it is active (whether objects can be
 * selected, whether Fabric's free-drawing mode is on, which cursor to show)
 * and can draw transient visuals (e.g. the pen tool's rubber band) through
 * `renderOverlay`, which runs after the scene on every render.
 */
import type { FabricObject, Point, TPointerEvent } from 'fabric';
import type { Editor } from '../Editor';
import type { ToolId } from '../types';

export interface ToolPointerEvent {
  /** Native event. */
  e: TPointerEvent;
  /** Pointer in scene (artboard) coordinates. */
  scenePoint: Point;
  /** Pointer in viewport (screen canvas) coordinates. */
  viewportPoint: Point;
  /** Fabric's hit-test result, when the tool allows targeting. */
  target?: FabricObject;
  shift: boolean;
  alt: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  mod: boolean;
}

export abstract class Tool {
  abstract readonly id: ToolId;
  /** CSS cursor used over the canvas. */
  cursor = 'crosshair';
  /** When true, Fabric's normal click-to-select/transform behaviour is enabled. */
  readonly selectsObjects: boolean = false;
  /** When true (and `selectsObjects`), dragging on empty canvas draws a selection marquee. */
  readonly marquee: boolean = true;
  /**
   * Restricts which objects can be clicked while the tool is active. Tools
   * that return a filter get Fabric hit-testing even if they don't select.
   */
  readonly targetFilter: ((obj: FabricObject) => boolean) | null = null;
  /** When true, selection handles are drawn (otherwise just the outline). */
  readonly showsControls: boolean = false;
  /** True for tools that make region (marching ants) selections. */
  readonly selectsRegion: boolean = false;

  constructor(protected readonly editor: Editor) {}

  /** Called when the tool becomes active. */
  activate(): void {}
  /** Called when another tool becomes active. Must clean up any in-progress work. */
  deactivate(): void {}

  onPointerDown(_ev: ToolPointerEvent): void {}
  onPointerMove(_ev: ToolPointerEvent): void {}
  onPointerUp(_ev: ToolPointerEvent): void {}
  onDoubleClick(_ev: ToolPointerEvent): void {}

  /** Return `true` when the key was handled (stops global shortcuts). */
  onKeyDown(_e: KeyboardEvent): boolean {
    return false;
  }

  /** Tool options changed in the options bar. */
  onOptionsChanged(): void {}

  /** Draw transient visuals. `ctx` is in viewport (screen) coordinates. */
  renderOverlay(_ctx: CanvasRenderingContext2D): void {}
}
