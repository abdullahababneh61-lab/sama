/**
 * Arc / Spiral tool (Shift+\): one toolbar tool with two modes, picked in
 * the options bar (like the marquee shapes).
 *
 * Arc — drag from one end of the arc to the other. The arc is a quarter
 * ellipse that leaves the start point horizontally and meets the end point
 * vertically, so it bulges towards the corner you drag to (drag the other
 * way to flip it). Shift: a symmetric quarter circle.
 *
 * Spiral — press at the centre and drag outwards: the distance sets the
 * radius and the direction sets where the outer end points, so moving around
 * the centre rotates the spiral. Shift snaps that direction to 45° steps.
 * "Turns" in the options bar (default 4) sets how many times it winds, and
 * also rewinds a selected spiral after it was drawn.
 *
 * Also see GeneratedShapeTool: click for a default size, Esc cancels a drag.
 * Uses its own stroke colour and width (options bar); the results are
 * ordinary open paths.
 */
import { Path, type FabricObject } from 'fabric';
import { GeneratedShapeTool, type DragState } from './GeneratedShapeTool';
import { arcPathData, spiralPathData } from '../pathShapes';
import { createSpiral } from '../generatedShapes';
import type { ShapeParams } from '../types';

/** Size of an arc / radius of a spiral made by a plain click. */
const DEFAULT_ARC = 100;
const DEFAULT_SPIRAL_RADIUS = 50;

export class ArcSpiralTool extends GeneratedShapeTool {
  readonly id = 'arcSpiral' as const;

  private get options() {
    return this.editor.toolOptions.arcSpiral;
  }

  protected get style() {
    return { stroke: this.options.stroke, strokeWidth: this.options.strokeWidth };
  }

  protected get settingsLabel() {
    return 'Spiral turns';
  }

  /** Spiral radius and outer-end direction for a drag. */
  private spiralOf(drag: DragState) {
    if (!drag.end) return { radius: DEFAULT_SPIRAL_RADIUS, angle: 0 };
    const dx = drag.end.x - drag.start.x;
    const dy = drag.end.y - drag.start.y;
    let angle = Math.atan2(dy, dx);
    if (drag.shift) angle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { radius: Math.max(1, Math.hypot(dx, dy)), angle };
  }

  private arcEnd(drag: DragState) {
    return drag.end ?? { x: drag.start.x + DEFAULT_ARC, y: drag.start.y + DEFAULT_ARC };
  }

  protected previewPath(drag: DragState): string {
    if (this.options.mode === 'arc') return arcPathData(drag.start, this.arcEnd(drag), drag.shift);
    const { radius, angle } = this.spiralOf(drag);
    return spiralPathData(drag.start, radius, this.options.turns, angle);
  }

  protected create(drag: DragState): FabricObject | null {
    if (this.options.mode === 'spiral') {
      const { radius, angle } = this.spiralOf(drag);
      return createSpiral(drag.start, radius, this.options.turns, angle, this.style);
    }
    const end = this.arcEnd(drag);
    if (Math.hypot(end.x - drag.start.x, end.y - drag.start.y) < 1) return null;
    const arc = new Path(arcPathData(drag.start, end, drag.shift), {
      fill: '',
      stroke: this.options.stroke,
      strokeWidth: Math.max(0.1, this.options.strokeWidth),
      strokeUniform: true,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    });
    arc.samaKind = 'path';
    arc.samaName = 'Arc';
    return arc;
  }

  protected historyLabel(obj: FabricObject) {
    return obj.samaParams?.type === 'spiral' ? 'Spiral' : 'Arc';
  }

  protected settings() {
    return { turns: this.options.turns };
  }

  protected applySettings(current: ShapeParams, changed: Record<string, number>): ShapeParams | null {
    if (current.type !== 'spiral' || changed.turns === undefined || changed.turns === current.turns) return null;
    return { ...current, turns: changed.turns };
  }
}
