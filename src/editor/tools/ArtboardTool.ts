/**
 * Artboard tool (Shift+O), like Illustrator's.
 *
 * - Shows every artboard with a border and its name above the top-left
 *   corner. Click an artboard (or its name) to select it.
 * - Drag on the empty pasteboard: creates a new artboard ("Artboard N").
 * - Drag an artboard's border or one of the selected artboard's 8 handles:
 *   resizes it (the artwork stays where it is).
 * - Drag inside an artboard: moves it together with its artwork — every
 *   top-level layer whose centre is on it, including hidden and locked ones.
 * - Double-click the name: rename it in place (Enter to confirm, Esc to
 *   cancel).
 * - Delete/Backspace: deletes the selected artboard and the artwork on it,
 *   after a confirmation when there is artwork. The last artboard can't be
 *   deleted.
 * - Esc: cancels a drag in progress, otherwise deselects the artboard.
 *
 * The first artboard is the document's main artboard (the one exported to
 * PNG); its name is the document name. See `artboards.ts`.
 */
import type { Point } from 'fabric';
import { Tool, type ToolPointerEvent } from './Tool';
import {
  ARTBOARD_LABEL_FONT,
  MAIN_ARTBOARD_ID,
  nextArtboardName,
  PASTEBOARD_COLOR,
  rectFromPoints,
  type ArtboardRect,
} from '../artboards';
import { createId } from '../meta';
import { distance } from '../geometry';
import type { FabricObject } from 'fabric';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type Hit =
  | { kind: 'handle'; id: string; handle: Handle }
  | { kind: 'label'; id: string }
  | { kind: 'body'; id: string }
  | { kind: 'empty' };

type Drag =
  | { kind: 'create'; start: Point; current: Point; list: ArtboardRect[] }
  | { kind: 'move'; id: string; start: Point; list: ArtboardRect[]; objects: FabricObject[]; applied: { x: number; y: number } }
  | { kind: 'resize'; id: string; handle: Handle; start: Point; list: ArtboardRect[] };

const HANDLE_SIZE = 8;
/** Screen distance (px) from an edge that counts as grabbing the border. */
const EDGE_TOLERANCE = 5;
const DRAG_THRESHOLD = 3;
const ACCENT = '#4d8dff';

const CURSORS: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

export class ArtboardTool extends Tool {
  readonly id = 'artboard' as const;
  cursor = 'crosshair';

  private drag: Drag | null = null;
  private downViewport: Point | null = null;
  private moved = false;
  private pointer: Point | null = null;
  private input: HTMLInputElement | null = null;

  private get selectedId(): string | null {
    const id = this.editor.state.selectedArtboardId;
    return id && this.editor.getArtboards().some((a) => a.id === id) ? id : null;
  }

  private select(id: string | null) {
    this.editor.store.setState({ selectedArtboardId: id });
    this.editor.canvas.requestRenderAll();
  }

  activate() {
    this.editor.canvas.requestRenderAll();
  }

  deactivate() {
    if (this.drag) this.cancelDrag();
    this.closeRename(true);
    this.editor.store.setState({ selectedArtboardId: null });
    this.editor.canvas.requestRenderAll();
  }

  onPointerDown(ev: ToolPointerEvent) {
    this.closeRename(true);
    const list = this.editor.getArtboards();
    const hit = this.hitTest(ev.viewportPoint);
    this.downViewport = ev.viewportPoint;
    this.moved = false;
    if (hit.kind === 'empty') {
      this.drag = { kind: 'create', start: ev.scenePoint, current: ev.scenePoint, list };
      return;
    }
    this.select(hit.id);
    if (hit.kind === 'handle') {
      this.drag = { kind: 'resize', id: hit.id, handle: hit.handle, start: ev.scenePoint, list };
    } else {
      this.drag = { kind: 'move', id: hit.id, start: ev.scenePoint, list, objects: [], applied: { x: 0, y: 0 } };
    }
  }

  onPointerMove(ev: ToolPointerEvent) {
    this.pointer = ev.viewportPoint;
    const drag = this.drag;
    if (!drag) {
      this.editor.setCursor(this.cursorFor(this.hitTest(ev.viewportPoint)));
      return;
    }
    if (!this.moved) {
      if (!this.downViewport || distance(ev.viewportPoint, this.downViewport) < DRAG_THRESHOLD) return;
      this.moved = true;
      if (drag.kind === 'move') {
        // The artwork on the artboard travels with it.
        this.editor.clearSelection();
        drag.objects = this.editor.artboardContents(drag.id, drag.list);
      }
    }
    const dx = Math.round(ev.scenePoint.x - drag.start.x);
    const dy = Math.round(ev.scenePoint.y - drag.start.y);
    if (drag.kind === 'create') {
      drag.current = ev.scenePoint;
      this.editor.canvas.requestRenderAll();
      return;
    }
    if (drag.kind === 'move') {
      for (const o of drag.objects) this.editor.translateInScene(o, dx - drag.applied.x, dy - drag.applied.y);
      drag.applied = { x: dx, y: dy };
      this.editor.setArtboardPreview(drag.list.map((a) => (a.id === drag.id ? { ...a, x: a.x + dx, y: a.y + dy } : a)));
      return;
    }
    this.editor.setArtboardPreview(drag.list.map((a) => (a.id === drag.id ? resized(a, drag.handle, dx, dy) : a)));
  }

  onPointerUp() {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    if (!this.moved) {
      if (drag.kind === 'create') this.select(null); // click on the pasteboard
      this.editor.setArtboardPreview(null);
      return;
    }
    if (drag.kind === 'create') {
      const r = rectFromPoints(drag.start, drag.current);
      if (r.width < 1 || r.height < 1) return;
      const id = createId('artboard');
      const name = nextArtboardName(drag.list, this.editor.artboardLabel);
      this.editor.applyArtboards([...drag.list, { id, name, ...r }], 'New artboard');
      this.select(id);
      return;
    }
    const preview = this.editor.getArtboards();
    this.editor.applyArtboards(preview, drag.kind === 'move' ? 'Move artboard' : 'Resize artboard');
  }

  onDoubleClick(ev: ToolPointerEvent) {
    const hit = this.hitTest(ev.viewportPoint);
    if (hit.kind === 'label') this.openRename(hit.id);
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      if (this.drag) {
        this.cancelDrag();
        return true;
      }
      if (this.selectedId) {
        this.select(null);
        return true;
      }
      return false;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Always ours with this tool, so a key press never deletes layers selected earlier.
      const id = this.selectedId;
      if (id && !this.drag) this.deleteArtboard(id);
      return true;
    }
    return false;
  }

  /** Deletes an artboard (with its artwork), asking first when it has artwork. */
  deleteArtboard(id: string) {
    const list = this.editor.getArtboards();
    const board = list.find((a) => a.id === id);
    if (!board) return;
    if (list.length < 2) {
      this.editor.notify('toast.artboardLast', 'warning');
      return;
    }
    const count = this.editor.artboardContents(id).length;
    if (count && !window.confirm(this.editor.translate('artboard.confirmDelete', { name: board.name, count }))) return;
    if (this.editor.deleteArtboard(id)) this.select(null);
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    const list = this.editor.getArtboards();
    const selected = this.selectedId;
    ctx.save();
    ctx.lineWidth = 1;
    for (const a of list) {
      const r = this.viewportRect(a);
      const isSel = a.id === selected;
      ctx.strokeStyle = isSel ? ACCENT : 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = isSel ? 1.5 : 1;
      ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
      if (isSel) {
        // Selected name in the accent colour (covering the plain label below).
        const box = this.editor.artboardLabelBox(a);
        ctx.fillStyle = PASTEBOARD_COLOR;
        ctx.fillRect(box.x - 1, box.y, box.w + 2, box.h);
        ctx.font = ARTBOARD_LABEL_FONT;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = ACCENT;
        ctx.fillText(box.text, box.x, box.y + box.h - 3);
        for (const [, p] of this.handlePoints(a)) {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1;
          ctx.fillRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
          ctx.strokeRect(p.x - HANDLE_SIZE / 2 + 0.5, p.y - HANDLE_SIZE / 2 + 0.5, HANDLE_SIZE - 1, HANDLE_SIZE - 1);
        }
      }
    }
    const drag = this.drag;
    if (drag?.kind === 'create' && this.moved) {
      const rr = rectFromPoints(drag.start, drag.current);
      const r = this.viewportRect({ ...rr, id: '', name: '' });
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(77, 141, 255, 0.08)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
      this.drawSize(ctx, rr.width, rr.height);
    } else if (drag?.kind === 'resize' && this.moved) {
      const a = list.find((b) => b.id === drag.id);
      if (a) this.drawSize(ctx, a.width, a.height);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------

  private cancelDrag() {
    const drag = this.drag;
    this.drag = null;
    if (drag?.kind === 'move') {
      for (const o of drag.objects) this.editor.translateInScene(o, -drag.applied.x, -drag.applied.y);
    }
    this.editor.setArtboardPreview(null);
  }

  private hitTest(p: { x: number; y: number }): Hit {
    const list = this.editor.getArtboards();
    const selected = list.find((a) => a.id === this.selectedId);
    if (selected) {
      for (const [handle, hp] of this.handlePoints(selected)) {
        if (Math.abs(p.x - hp.x) <= HANDLE_SIZE / 2 + 2 && Math.abs(p.y - hp.y) <= HANDLE_SIZE / 2 + 2) {
          return { kind: 'handle', id: selected.id, handle };
        }
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const box = this.editor.artboardLabelBox(list[i]);
      if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) return { kind: 'label', id: list[i].id };
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      const r = this.viewportRect(a);
      const t = EDGE_TOLERANCE;
      const inX = p.x >= r.x - t && p.x <= r.x + r.w + t;
      const inY = p.y >= r.y - t && p.y <= r.y + r.h + t;
      if (!inX || !inY) continue;
      const n = Math.abs(p.y - r.y) <= t;
      const s = Math.abs(p.y - (r.y + r.h)) <= t;
      const w = Math.abs(p.x - r.x) <= t;
      const e = Math.abs(p.x - (r.x + r.w)) <= t;
      const v = n ? 'n' : s ? 's' : '';
      const h = w ? 'w' : e ? 'e' : '';
      if (v || h) return { kind: 'handle', id: a.id, handle: (v + h) as Handle };
      if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return { kind: 'body', id: a.id };
    }
    return { kind: 'empty' };
  }

  private cursorFor(hit: Hit): string {
    if (hit.kind === 'handle') return CURSORS[hit.handle];
    if (hit.kind === 'body' || hit.kind === 'label') return 'move';
    return this.cursor;
  }

  private viewportRect(a: ArtboardRect) {
    const p = this.editor.sceneToViewport({ x: a.x, y: a.y });
    const q = this.editor.sceneToViewport({ x: a.x + a.width, y: a.y + a.height });
    return { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y };
  }

  private handlePoints(a: ArtboardRect): [Handle, { x: number; y: number }][] {
    const r = this.viewportRect(a);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return [
      ['nw', { x: r.x, y: r.y }],
      ['n', { x: cx, y: r.y }],
      ['ne', { x: r.x + r.w, y: r.y }],
      ['e', { x: r.x + r.w, y: cy }],
      ['se', { x: r.x + r.w, y: r.y + r.h }],
      ['s', { x: cx, y: r.y + r.h }],
      ['sw', { x: r.x, y: r.y + r.h }],
      ['w', { x: r.x, y: cy }],
    ];
  }

  private drawSize(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.pointer) return;
    const text = `${Math.round(w)} × ${Math.round(h)}`;
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = '600 11px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(12, 12, 15, 0.85)';
    ctx.fillRect(this.pointer.x + 14, this.pointer.y + 14, tw, 18);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.pointer.x + 19, this.pointer.y + 23);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Inline rename

  private openRename(id: string) {
    this.closeRename(true);
    const board = this.editor.getArtboards().find((a) => a.id === id);
    if (!board) return;
    const box = this.editor.artboardLabelBox(board);
    const input = document.createElement('input');
    input.className = 'sw-artboard-rename';
    input.value = board.name;
    input.dataset.testid = 'artboard-rename';
    input.dataset.artboardId = id;
    input.style.transform = `translate(${Math.round(box.x) - 4}px, ${Math.round(box.y) - 2}px)`;
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.closeRename(true);
      else if (e.key === 'Escape') this.closeRename(false);
    });
    input.addEventListener('blur', () => this.closeRename(true));
    this.editor.canvasHost.appendChild(input);
    this.input = input;
    input.focus();
    input.select();
  }

  /** Closes the rename field, applying the new name when `commit` is true. */
  private closeRename(commit: boolean) {
    const input = this.input;
    if (!input) return;
    this.input = null;
    const id = input.dataset.artboardId;
    const name = input.value.trim();
    input.remove();
    if (!commit || !name) return;
    const list = this.editor.getArtboards();
    const board = list.find((a) => a.id === id);
    if (!board || board.name === name) return;
    this.editor.applyArtboards(
      list.map((a) => (a.id === id ? { ...a, name } : a)),
      id === MAIN_ARTBOARD_ID ? 'Rename document' : 'Rename artboard',
    );
  }
}

/** An artboard resized by dragging one handle by (dx, dy); at least 1×1. */
export function resized(a: ArtboardRect, handle: Handle, dx: number, dy: number): ArtboardRect {
  let x0 = a.x;
  let y0 = a.y;
  let x1 = a.x + a.width;
  let y1 = a.y + a.height;
  if (handle.includes('w')) x0 = Math.min(x0 + dx, x1 - 1);
  if (handle.includes('e')) x1 = Math.max(x1 + dx, x0 + 1);
  if (handle.includes('n')) y0 = Math.min(y0 + dy, y1 - 1);
  if (handle.includes('s')) y1 = Math.max(y1 + dy, y0 + 1);
  return { ...a, x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
