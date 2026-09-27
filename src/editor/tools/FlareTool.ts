/**
 * Flare tool (Shift+U): places a lens-flare graphic — a bright core in a
 * soft glow, rays, a streak, and smaller rings trailing away from the centre
 * (see flare.ts). Two steps, as in Illustrator:
 *
 * 1. Press where the centre goes (a default-sized flare appears right away)
 *    and drag to size the main glow. Release.
 * 2. The rings now follow the pointer: they trail from the centre towards it
 *    (Shift snaps the direction to 45°). Click — or press and drag — to set
 *    where they end, and the flare is created. Enter creates it with the
 *    rings where they are now.
 *
 * Esc (or Ctrl/Cmd+Z) during either step cancels. Switching tools during
 * step 2 keeps the flare. The result is one group layer (one undo step,
 * "Flare"): select, move, resize and rotate it with the Selection tool.
 * Colours and proportions are fixed defaults for now.
 */
import type { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { createFlare, defaultRingsVector } from '../flare';
import type { XY } from '../pathShapes';

/** Glow radius of a flare placed by a plain click (artboard px). */
export const DEFAULT_FLARE_RADIUS = 60;
/** Pointer travel (screen px) before a press counts as a drag. */
const DRAG_THRESHOLD = 3;

type Step =
  | { kind: 'idle' }
  /** Button held: sizing the glow. */
  | { kind: 'radius'; center: Point; radius: number; moved: boolean }
  /** Glow set: placing the rings (`pressed` while the button is down). */
  | { kind: 'rings'; center: Point; radius: number; rings: XY; pressed: boolean };

export class FlareTool extends Tool {
  readonly id = 'flare' as const;
  cursor = 'crosshair';

  private step: Step = { kind: 'idle' };

  get isPlacing() {
    return this.step.kind !== 'idle';
  }

  deactivate() {
    if (this.step.kind === 'rings') this.finish();
    this.step = { kind: 'idle' };
  }

  private ringsToward(center: Point, p: Point, shift: boolean): XY {
    let dx = p.x - center.x;
    let dy = p.y - center.y;
    if (shift) {
      const len = Math.hypot(dx, dy);
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      dx = Math.cos(a) * len;
      dy = Math.sin(a) * len;
    }
    return { x: dx, y: dy };
  }

  onPointerDown(ev: ToolPointerEvent) {
    const step = this.step;
    if (step.kind === 'rings') {
      this.step = { ...step, rings: this.ringsToward(step.center, ev.scenePoint, ev.shift), pressed: true };
    } else {
      this.editor.flushDebouncedCommit();
      this.step = { kind: 'radius', center: ev.scenePoint, radius: DEFAULT_FLARE_RADIUS, moved: false };
    }
    this.editor.canvas.requestRenderAll();
  }

  onPointerMove(ev: ToolPointerEvent) {
    const step = this.step;
    if (step.kind === 'radius') {
      const c = this.editor.sceneToViewport(step.center);
      const moved = step.moved || Math.hypot(ev.viewportPoint.x - c.x, ev.viewportPoint.y - c.y) > DRAG_THRESHOLD;
      const radius = moved ? Math.max(2, Math.hypot(ev.scenePoint.x - step.center.x, ev.scenePoint.y - step.center.y)) : step.radius;
      this.step = { ...step, moved, radius };
    } else if (step.kind === 'rings') {
      this.step = { ...step, rings: this.ringsToward(step.center, ev.scenePoint, ev.shift) };
    } else return;
    this.editor.canvas.requestRenderAll();
  }

  onPointerUp(ev: ToolPointerEvent) {
    const step = this.step;
    if (step.kind === 'radius') {
      // Glow sized: now place the rings (they start out at the default spot).
      this.step = { kind: 'rings', center: step.center, radius: step.radius, rings: defaultRingsVector(step.radius), pressed: false };
    } else if (step.kind === 'rings' && step.pressed) {
      this.step = { ...step, rings: this.ringsToward(step.center, ev.scenePoint, ev.shift) };
      this.finish();
    }
    this.editor.canvas.requestRenderAll();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (this.step.kind === 'idle') return false;
    const undo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
    if (e.key === 'Escape' || undo) {
      this.step = { kind: 'idle' };
      this.editor.canvas.requestRenderAll();
      return true;
    }
    if (e.key === 'Enter' && this.step.kind === 'rings') {
      this.finish();
      return true;
    }
    return false;
  }

  /** Creates the flare layer from step 2's state. */
  private finish() {
    const step = this.step;
    this.step = { kind: 'idle' };
    if (step.kind !== 'rings') return;
    const flare = createFlare(step.center, step.radius, step.rings);
    this.editor.addLayer(flare);
    this.editor.commit('Flare');
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    const step = this.step;
    if (step.kind === 'idle') return;
    const rings = step.kind === 'rings' ? step.rings : defaultRingsVector(step.radius);
    // Preview with the real graphic (built fresh, not cached).
    const preview = createFlare(step.center, step.radius, rings);
    preview.set({ objectCaching: false });
    preview.getObjects().forEach((o) => o.set({ objectCaching: false }));
    const v = this.editor.canvas.viewportTransform;
    const zoom = this.editor.canvas.getZoom();
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([v[0], v[1], v[2], v[3], v[4], v[5]])));
    preview.render(ctx);
    // Guides: the glow's radius while sizing, the ring line while placing rings.
    ctx.strokeStyle = '#4d8dff';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.beginPath();
    if (step.kind === 'radius') ctx.arc(step.center.x, step.center.y, step.radius, 0, Math.PI * 2);
    else {
      ctx.moveTo(step.center.x, step.center.y);
      ctx.lineTo(step.center.x + rings.x, step.center.y + rings.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}
