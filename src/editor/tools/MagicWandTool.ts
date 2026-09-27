/**
 * Magic Wand tool (Y): click a layer to select every layer with a similar
 * colour (Illustrator's Magic Wand, applied to Sama's layers).
 *
 * - Tolerance (0–255, default 32): how far each RGB channel of another
 *   layer's colour may be from the clicked layer's colour.
 * - Contiguous (on by default): only layers connected to the clicked one —
 *   touching or overlapping it, directly or through other matching layers.
 *   Off: every matching layer in the document.
 * - Mode (options bar): New, Add, Subtract or Intersect. Keys held on the
 *   click override it: Shift = add, Alt/Option = subtract, Shift+Alt =
 *   intersect. The cursor shows the mode (+ / − / × next to the wand).
 * - Clicking empty canvas deselects in New mode (keeps the selection
 *   otherwise). Esc: deselect.
 *
 * A layer's colour is its solid fill; layers without a fill (lines, open
 * paths, outlined shapes) use their solid stroke colour instead. Layers
 * that have no single colour — images, groups, paint layers, gradients —
 * are never matched; clicking one just selects that layer. Only top-level
 * layers are compared (a group counts as one layer), and hidden or locked
 * layers are skipped. "Touching" is judged from the layers' (rotated)
 * bounding boxes.
 */
import { Color, type FabricObject } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import { isEffectivelyLocked } from '../meta';
import { combineLayers, resolveSelectionMode } from '../selectionModes';
import { wandCursor } from '../cursors';
import { ModeCursor } from './modeCursor';

export class MagicWandTool extends Tool {
  readonly id = 'magicWand' as const;
  cursor = wandCursor('new');

  private readonly modeCursor = new ModeCursor(this.editor, (mods) => wandCursor(this.modeFor(mods)));
  private hover: FabricObject | null = null;
  /** Selection when the button went down (Fabric clears it before our handler runs). */
  private before: FabricObject[] = [];
  private offBefore: (() => void) | null = null;

  activate() {
    this.editor.canvas.controlsMode = 'outline';
    this.offBefore = this.editor.canvas.on('mouse:down:before', () => {
      this.before = this.editor.canvas.getActiveObjects();
    });
    this.modeCursor.start();
    this.editor.canvas.requestRenderAll();
  }

  deactivate() {
    this.modeCursor.stop();
    this.offBefore?.();
    this.offBefore = null;
    this.hover = null;
  }

  onPointerMove(ev: ToolPointerEvent) {
    const hit = this.editor.layerAt(ev.scenePoint);
    if (hit !== this.hover) {
      this.hover = hit;
      this.editor.canvas.requestRenderAll();
    }
  }

  onOptionsChanged() {
    this.modeCursor.refresh();
  }

  onPointerDown(ev: ToolPointerEvent) {
    const mode = this.modeFor(ev);
    const hit = this.editor.layerAt(ev.scenePoint);
    const { tolerance, contiguous } = this.editor.toolOptions.magicWand;
    const picked = hit ? similarLayers(this.editor.canvas.getObjects(), hit, tolerance, contiguous) : [];
    const current = this.before.filter((o) => !o.parent);
    const next = combineLayers(current, picked, mode);
    const order = this.editor.canvas.getObjects();
    next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (next.length) this.editor.selectObjects(next);
    else this.editor.clearSelection();
  }

  /** The tool's mode, overridden by the keys held. */
  private modeFor(mods: { shift: boolean; alt: boolean }) {
    return resolveSelectionMode(this.editor.selectionModeOf(this.id), mods);
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    const active = this.editor.canvas.getActiveObjects();
    if (this.hover && !active.includes(this.hover)) this.editor.strokeObjectOutline(ctx, this.hover, '#4d8dff', 1.5);
  }
}

/** RGB of a layer's solid fill (or stroke when it has no fill); null when it has none. */
export function layerColor(obj: FabricObject): [number, number, number] | null {
  const solid = (paint: unknown): [number, number, number] | null => {
    if (typeof paint !== 'string' || !paint || paint === 'transparent' || paint === 'none') return null;
    const c = new Color(paint).getSource();
    if (c[3] === 0) return null;
    return [c[0], c[1], c[2]];
  };
  if (obj.samaKind === 'group' || obj.samaKind === 'paint' || obj.samaKind === 'image') return null;
  if (obj.samaKind === 'line') return solid(obj.stroke);
  return solid(obj.fill) ?? solid(obj.stroke);
}

/** Largest per-channel difference between two colours. */
export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/**
 * Layers similar in colour to `seed` among `layers` (seed included). With
 * `contiguous`, only those reachable from the seed through touching
 * matching layers.
 */
export function similarLayers(layers: FabricObject[], seed: FabricObject, tolerance: number, contiguous: boolean): FabricObject[] {
  const seedColor = layerColor(seed);
  if (!seedColor) return [seed];
  const candidates = layers.filter((o) => {
    if (o === seed) return true;
    if (!o.visible || isEffectivelyLocked(o)) return false;
    const c = layerColor(o);
    return c !== null && colorDistance(c, seedColor) <= tolerance;
  });
  if (!contiguous) return candidates;
  candidates.forEach((o) => o.setCoords());
  const reached = new Set<FabricObject>([seed]);
  const queue = [seed];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const o of candidates) {
      if (!reached.has(o) && touches(cur, o)) {
        reached.add(o);
        queue.push(o);
      }
    }
  }
  return candidates.filter((o) => reached.has(o));
}

/** Do two layers' (rotated) bounding boxes overlap or touch? */
function touches(a: FabricObject, b: FabricObject): boolean {
  if (a.intersectsWithObject(b) || a.isContainedWithinObject(b) || b.isContainedWithinObject(a)) return true;
  // Unrotated layers that only share an edge (e.g. two tiles side by side) touch too.
  return a.angle % 90 === 0 && b.angle % 90 === 0 && edgesMeet(a, b);
}

function edgesMeet(a: FabricObject, b: FabricObject): boolean {
  const r = a.getBoundingRect();
  const s = b.getBoundingRect();
  const EPS = 0.5;
  return (
    r.left <= s.left + s.width + EPS &&
    s.left <= r.left + r.width + EPS &&
    r.top <= s.top + s.height + EPS &&
    s.top <= r.top + r.height + EPS
  );
}
