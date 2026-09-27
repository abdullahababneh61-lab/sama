/**
 * Selection modes shared by every selecting tool — the Photoshop model.
 *
 * Each tool has a mode picked in the options bar: New, Add, Subtract or
 * Intersect. Modifier keys held when a selection *starts* override it for
 * that one gesture: Shift = add, Alt/Option = subtract, Shift+Alt =
 * intersect. (What the keys mean later in the gesture is up to the tool —
 * e.g. the marquees use Shift for a square and Alt for "from the centre".)
 *
 * The same rules apply to area (marching ants) selections and to the
 * layer-picking tools (Magic Wand, Object Selection).
 */
import type { FabricObject } from 'fabric';
import type { CombineMode } from './pixelSelection';
import type { SelectionMode, ToolId } from './types';

/** A tool's mode when the user hasn't picked one. */
export function defaultSelectionMode(tool: ToolId): SelectionMode {
  return tool === 'quickSelection' ? 'add' : 'new';
}

/** The mode of one gesture: modifier keys (at its start) override the tool's mode. */
export function resolveSelectionMode(base: SelectionMode, mods: { shift: boolean; alt: boolean }): SelectionMode {
  if (mods.shift && mods.alt) return 'intersect';
  if (mods.shift) return 'add';
  if (mods.alt) return 'subtract';
  return base;
}

/** The pixel-mask operation for a mode. */
export function combineModeFor(mode: SelectionMode): CombineMode {
  return mode === 'new' ? 'replace' : mode;
}

/** Applies a mode to a layer selection: the layers picked by one click/drag vs the current ones. */
export function combineLayers(current: FabricObject[], picked: FabricObject[], mode: SelectionMode): FabricObject[] {
  switch (mode) {
    case 'new':
      return picked;
    case 'add':
      return [...current, ...picked.filter((o) => !current.includes(o))];
    case 'subtract':
      return current.filter((o) => !picked.includes(o));
    case 'intersect':
      return current.filter((o) => picked.includes(o));
  }
}
