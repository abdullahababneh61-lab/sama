/**
 * Undo/redo history.
 *
 * Strategy: **document snapshots with structural sharing**.
 *
 * After every user action ("commit") we record the serialized form of each
 * top-level layer. Unchanged layers reuse the exact same string from the
 * previous snapshot, so a long history of small edits costs little memory:
 * only the layers that actually changed are stored again. Images are stored
 * by reference (a short `blob:` URL + asset id), never as pixel data.
 *
 * Restoring a snapshot is done by the Editor, which reuses any live object
 * whose serialized form is unchanged and only re-creates the ones that differ
 * (see `Editor.restoreSnapshot`). That keeps undo fast even with many images.
 *
 * This class is deliberately framework-free and synchronous so it can be unit
 * tested in isolation.
 */
import type { DocumentSettings } from './types';
import { sameSelection, type EncodedSelection } from './pixelSelection';

export interface SnapshotObject {
  id: string;
  /** JSON string produced by Fabric's `toObject()`. */
  json: string;
}

export interface Snapshot {
  label: string;
  doc: DocumentSettings;
  objects: SnapshotObject[];
  /** Ids selected when the snapshot was taken (restored on undo/redo). */
  selection: string[];
  /** The region (marching ants) selection, run-length encoded; null/absent = none. */
  pixelSelection?: EncodedSelection | null;
}

export const DEFAULT_HISTORY_LIMIT = 100;

export class History {
  private entries: Snapshot[] = [];
  private index = -1;

  constructor(private readonly limit = DEFAULT_HISTORY_LIMIT) {}

  /** Clears the history and records `initial` as the first state. */
  reset(initial: Snapshot) {
    this.entries = [initial];
    this.index = 0;
  }

  /** The snapshot matching what is currently on the canvas. */
  get current(): Snapshot | undefined {
    return this.entries[this.index];
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.entries.length - 1;
  }

  get position() {
    return this.index;
  }

  get labels(): string[] {
    return this.entries.map((e) => e.label);
  }

  /**
   * Records a new state. Returns `false` (and records nothing) when the state
   * is identical to the current one — e.g. clicking an object without moving it.
   */
  push(next: Snapshot): boolean {
    const prev = this.current;
    if (prev && snapshotsEqual(prev, next)) return false;
    if (prev) shareStrings(prev, next);
    // Any redo states are discarded once a new action happens.
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(next);
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }
    this.index = this.entries.length - 1;
    return true;
  }

  /**
   * Replaces the current snapshot without creating a new step. Used to keep
   * the "current" state accurate after non-undoable bookkeeping changes.
   */
  replaceCurrent(next: Snapshot) {
    if (this.index < 0) return this.reset(next);
    const prev = this.entries[this.index];
    shareStrings(prev, next);
    next.label = prev.label;
    this.entries[this.index] = next;
  }

  /** Moves one step back and returns the snapshot to restore. */
  undo(): Snapshot | null {
    if (!this.canUndo) return null;
    this.index--;
    return this.entries[this.index];
  }

  /** Moves one step forward and returns the snapshot to restore. */
  redo(): Snapshot | null {
    if (!this.canRedo) return null;
    this.index++;
    return this.entries[this.index];
  }

  /** Jumps to an arbitrary step (history panel click). */
  goTo(position: number): Snapshot | null {
    if (position < 0 || position >= this.entries.length || position === this.index) return null;
    this.index = position;
    return this.entries[this.index];
  }
}

export function snapshotsEqual(a: Snapshot, b: Snapshot) {
  if (a.objects.length !== b.objects.length) return false;
  if (
    a.doc.width !== b.doc.width ||
    a.doc.height !== b.doc.height ||
    a.doc.background !== b.doc.background ||
    a.doc.name !== b.doc.name ||
    JSON.stringify(a.doc.artboards ?? []) !== JSON.stringify(b.doc.artboards ?? []) ||
    !sameSelection(a.pixelSelection, b.pixelSelection)
  ) {
    return false;
  }
  for (let i = 0; i < a.objects.length; i++) {
    if (a.objects[i].id !== b.objects[i].id || a.objects[i].json !== b.objects[i].json) return false;
  }
  return true;
}

/** Makes `next` reuse identical strings from `prev` (memory sharing). */
function shareStrings(prev: Snapshot, next: Snapshot) {
  const byId = new Map(prev.objects.map((o) => [o.id, o.json]));
  for (const o of next.objects) {
    const old = byId.get(o.id);
    if (old !== undefined && old === o.json) o.json = old;
  }
}
