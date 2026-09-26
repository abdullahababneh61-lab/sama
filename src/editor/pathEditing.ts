/**
 * Anchor-point editing for vector paths (Direct Selection tool).
 *
 * Builds on Fabric's `createPathControls` but behaves like Illustrator:
 * - Dragging an anchor moves its Bézier handles with it.
 * - Handles that sit exactly on their anchor (corner points) are hidden, so
 *   dragging a corner moves the point instead of an invisible handle.
 * - Dragging one handle of a smooth point keeps the opposite handle aligned
 *   (hold Alt to break the pair and make a cusp).
 * - Closed paths stay closed: the first anchor and the closing segment's end
 *   point move together.
 * - `toggleAnchorSmooth` converts a corner into a smooth point and back
 *   (double-click an anchor).
 */
import { controlsUtils, Point, util } from 'fabric';
import type { Control, Path, TPointerEvent, Transform } from 'fabric';

type Cmd = (string | number)[];
interface PtRef {
  c: number;
  p: number;
}
interface Move {
  ref: PtRef;
  x: number;
  y: number;
}

const EPS = 0.5;

const cmds = (path: Path) => path.path as unknown as Cmd[];

function pt(path: Path, r: PtRef) {
  const c = cmds(path)[r.c];
  return new Point(c[r.p] as number, c[r.p + 1] as number);
}

function endRef(path: Path, c: number): PtRef {
  return { c, p: cmds(path)[c].length - 2 };
}

export function isClosed(path: Path) {
  const list = cmds(path);
  return list[list.length - 1]?.[0] === 'Z';
}

/** Index of the drawing command that closes the path back onto its first point. */
function closingDuplicate(path: Path): number | null {
  if (!isClosed(path)) return null;
  const list = cmds(path);
  const i = list.length - 2;
  if (i < 1) return null;
  const m = pt(path, { c: 0, p: 1 });
  const e = pt(path, endRef(path, i));
  return m.distanceFrom(e) < 0.01 ? i : null;
}

/** Converts a pointer (in the path's parent plane) to path coordinates. */
function toPathSpace(path: Path, x: number, y: number) {
  const local = util.sendPointToPlane(new Point(x, y), undefined, path.calcOwnMatrix());
  return local.add(path.pathOffset);
}

/**
 * Moves several path points at once and keeps the rest of the path visually
 * in place (the bounding box, and so `pathOffset`, may change).
 */
function applyMoves(path: Path, moves: Move[]) {
  const list = cmds(path);
  const moved = new Set(moves.map((m) => `${m.ref.c}:${m.ref.p}`));
  // Reference point that does not move, used to compensate the position.
  let ref: PtRef | null = null;
  for (let c = 0; c < list.length && !ref; c++) {
    for (let p = 1; p + 1 < list[c].length; p += 2) {
      if (!moved.has(`${c}:${p}`)) {
        ref = { c, p };
        break;
      }
    }
  }
  const refPoint = ref ? pt(path, ref) : null;
  const before = refPoint?.subtract(path.pathOffset).transform(path.calcOwnMatrix());
  for (const m of moves) {
    list[m.ref.c][m.ref.p] = m.x;
    list[m.ref.c][m.ref.p + 1] = m.y;
  }
  path.setDimensions();
  if (refPoint && before) {
    const after = refPoint.subtract(path.pathOffset).transform(path.calcOwnMatrix());
    const diff = after.subtract(before);
    path.left -= diff.x;
    path.top -= diff.y;
  }
  path.set('dirty', true);
  path.setCoords();
}

/** Handles attached to the anchor at the end of command `c`. */
function anchorHandles(path: Path, c: number): { inRef: PtRef | null; outRef: PtRef | null } {
  const list = cmds(path);
  const dup = closingDuplicate(path);
  let inRef: PtRef | null = list[c]?.[0] === 'C' ? { c, p: 3 } : null;
  if (c === 0 && dup !== null && list[dup][0] === 'C') inRef = { c: dup, p: 3 };
  const next = list[c + 1];
  let outRef: PtRef | null = next?.[0] === 'C' ? { c: c + 1, p: 1 } : null;
  if (c === dup) outRef = list[1]?.[0] === 'C' ? { c: 1, p: 1 } : null;
  return { inRef, outRef };
}

/** Points that move together with the anchor at the end of command `c`. */
function anchorLinks(path: Path, c: number): PtRef[] {
  const { inRef, outRef } = anchorHandles(path, c);
  const links = [inRef, outRef].filter((r): r is PtRef => !!r);
  const dup = closingDuplicate(path);
  if (c === 0 && dup !== null) links.push(endRef(path, dup));
  return links;
}

/** The anchor a handle belongs to, and the handle on the other side of it. */
function handleInfo(path: Path, c: number, p: number): { anchor: PtRef; opposite: PtRef | null } | null {
  const list = cmds(path);
  const dup = closingDuplicate(path);
  if (p === 3) {
    // Incoming handle of the anchor at the end of command c.
    const anchorCmd = c === dup ? 0 : c;
    return { anchor: endRef(path, c), opposite: anchorHandles(path, anchorCmd).outRef };
  }
  if (p === 1) {
    // Outgoing handle of the anchor at the end of command c - 1.
    const prev = c - 1;
    const anchorCmd = prev;
    const { inRef } = anchorHandles(path, anchorCmd === dup ? 0 : anchorCmd);
    if (!list[prev]) return null;
    return { anchor: endRef(path, prev), opposite: inRef };
  }
  return null;
}

type AnyControl = Control & {
  commandIndex: number;
  pointIndex: number;
  connectToCommandIndex?: number;
  connectToPointIndex?: number;
};

/** Anchor/handle controls for a Path (see module comment). */
export function createAnchorControls(path: Path): Record<string, Control> {
  const controls = controlsUtils.createPathControls(path, {
    cursorStyle: 'crosshair',
    sizeX: 9,
    sizeY: 9,
    controlPointStyle: { controlFill: '#ffffff', controlStroke: '#4d8dff', connectionDashArray: [3, 3] },
    pointStyle: { controlFill: '#4d8dff', controlStroke: '#ffffff' },
  }) as Record<string, AnyControl>;

  for (const [key, control] of Object.entries(controls)) {
    const isHandle = key.includes('_CP_');
    if (isHandle) {
      const coincident = (obj: Path) => {
        const a = pt(obj, { c: control.connectToCommandIndex!, p: control.connectToPointIndex! });
        return pt(obj, { c: control.commandIndex, p: control.pointIndex }).distanceFrom(a) < EPS;
      };
      const baseShould = control.shouldActivate.bind(control);
      control.shouldActivate = (k, obj, ...rest) => !coincident(obj as Path) && baseShould(k, obj, ...rest);
      const baseRender = control.render.bind(control);
      control.render = (ctx, left, top, style, obj) => {
        if (!coincident(obj as Path)) baseRender(ctx, left, top, style, obj);
      };
      control.actionHandler = (e: TPointerEvent, transform: Transform, x: number, y: number) => {
        const obj = transform.target as Path;
        const local = toPathSpace(obj, x, y);
        const moves: Move[] = [{ ref: { c: control.commandIndex, p: control.pointIndex }, x: local.x, y: local.y }];
        const info = handleInfo(obj, control.commandIndex, control.pointIndex);
        if (info?.opposite && !(e as MouseEvent).altKey) {
          const anchor = pt(obj, info.anchor);
          const v1 = pt(obj, { c: control.commandIndex, p: control.pointIndex }).subtract(anchor);
          const v2 = pt(obj, info.opposite).subtract(anchor);
          const l1 = Math.hypot(v1.x, v1.y);
          const l2 = Math.hypot(v2.x, v2.y);
          // Smooth point: the two handles point in opposite directions.
          const smooth = l1 > EPS && l2 > EPS && (v1.x * v2.x + v1.y * v2.y) / (l1 * l2) < -0.999;
          if (smooth) {
            const d = anchor.subtract(local);
            const len = Math.hypot(d.x, d.y);
            if (len > 0.01) {
              moves.push({ ref: info.opposite, x: anchor.x + (d.x / len) * l2, y: anchor.y + (d.y / len) * l2 });
            }
          }
        }
        applyMoves(obj, moves);
        return true;
      };
    } else {
      const dupOf = (obj: Path) => closingDuplicate(obj) === control.commandIndex;
      // The closing duplicate of the first anchor is hidden: the first anchor controls both.
      const baseShould = control.shouldActivate.bind(control);
      control.shouldActivate = (k, obj, ...rest) => !dupOf(obj as Path) && baseShould(k, obj, ...rest);
      const baseRender = control.render.bind(control);
      control.render = (ctx, left, top, style, obj) => {
        if (!dupOf(obj as Path)) baseRender(ctx, left, top, style, obj);
      };
      control.actionHandler = (_e: TPointerEvent, transform: Transform, x: number, y: number) => {
        const obj = transform.target as Path;
        const c = control.commandIndex;
        const anchorRef = { c, p: control.pointIndex };
        const old = pt(obj, anchorRef);
        const local = toPathSpace(obj, x, y);
        const dx = local.x - old.x;
        const dy = local.y - old.y;
        const moves: Move[] = [{ ref: anchorRef, x: local.x, y: local.y }];
        for (const r of anchorLinks(obj, c)) {
          const p = pt(obj, r);
          moves.push({ ref: r, x: p.x + dx, y: p.y + dy });
        }
        applyMoves(obj, moves);
        return true;
      };
    }
  }
  return controls;
}

/** Finds which anchor (command index) a control key refers to, if any. */
export function anchorIndexFromControlKey(key: string): number | null {
  const m = /^c_(\d+)_[A-Z]$/.exec(key);
  return m ? Number(m[1]) : null;
}

/**
 * Toggles an anchor between corner (handles collapsed) and smooth (handles
 * aligned along the neighbours' direction). Straight segments next to the
 * anchor are converted to curves as needed. Returns true if the path changed
 * structure (controls must be rebuilt).
 */
export function toggleAnchorSmooth(path: Path, commandIndex: number): boolean {
  const list = cmds(path);
  const dup = closingDuplicate(path);
  const c = commandIndex === dup ? 0 : commandIndex;
  let structural = false;

  const endPoint = (i: number) => pt(path, endRef(path, i));
  const prevIndex = c === 0 ? (dup !== null ? dup - 1 : null) : c - 1;
  const nextIndex = c + 1 < list.length && list[c + 1][0] !== 'Z' ? c + 1 : dup !== null && c === 0 ? 1 : null;

  // Straight neighbours become curves so they can have handles.
  const toCurve = (i: number) => {
    if (list[i][0] !== 'L') return;
    const start = i === 0 ? null : endPoint(i - 1);
    const end = endPoint(i);
    if (!start) return;
    list[i] = ['C', start.x, start.y, end.x, end.y, end.x, end.y];
    structural = true;
  };
  if (c !== 0) toCurve(c);
  else if (dup !== null) toCurve(dup);
  if (c + 1 < list.length && list[c + 1][0] === 'L') toCurve(c + 1);
  if (c === 0 && dup !== null && list[1]?.[0] === 'L') toCurve(1);

  const anchor = endPoint(c);
  const { inRef, outRef } = anchorHandles(path, c);
  const isCorner = (!inRef || pt(path, inRef).distanceFrom(anchor) < EPS) && (!outRef || pt(path, outRef).distanceFrom(anchor) < EPS);
  const moves: Move[] = [];
  if (isCorner) {
    const prev = prevIndex !== null ? endPoint(prevIndex) : null;
    const next = nextIndex !== null ? endPoint(nextIndex) : null;
    let dir = prev && next ? next.subtract(prev) : next ? next.subtract(anchor) : prev ? anchor.subtract(prev) : new Point(1, 0);
    const len = Math.hypot(dir.x, dir.y) || 1;
    dir = new Point(dir.x / len, dir.y / len);
    const lenIn = prev ? prev.distanceFrom(anchor) / 3 : 30;
    const lenOut = next ? next.distanceFrom(anchor) / 3 : 30;
    if (inRef) moves.push({ ref: inRef, x: anchor.x - dir.x * lenIn, y: anchor.y - dir.y * lenIn });
    if (outRef) moves.push({ ref: outRef, x: anchor.x + dir.x * lenOut, y: anchor.y + dir.y * lenOut });
  } else {
    if (inRef) moves.push({ ref: inRef, x: anchor.x, y: anchor.y });
    if (outRef) moves.push({ ref: outRef, x: anchor.x, y: anchor.y });
  }
  if (moves.length) applyMoves(path, moves);
  else if (structural) {
    path.setDimensions();
    path.setCoords();
  }
  return structural;
}
