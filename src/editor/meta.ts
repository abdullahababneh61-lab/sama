/**
 * Helpers for the Sama metadata stored on Fabric objects (id, name, kind,
 * lock state) and for walking the object tree.
 */
import { FabricImage, FabricObject, Group, IText, Path, Polygon, Rect, Ellipse, Line } from 'fabric';
import type { Canvas } from 'fabric';
import type { BlendMode, LayerKind, LayerNode } from './types';
import { PaintLayer } from './objects/PaintLayer';

let counter = 0;

/** Creates a short unique id, e.g. `l_lx3k2a_7`. */
export function createId(prefix = 'l'): string {
  counter = (counter + 1) % 1e6;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${rand}_${counter.toString(36)}`;
}

/** Default layer name per kind (English; the UI localizes display only when unnamed). */
const KIND_LABEL: Record<LayerKind, string> = {
  paint: 'Paint',
  path: 'Path',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  polygon: 'Polygon',
  text: 'Text',
  image: 'Image',
  group: 'Group',
};

export function kindLabel(kind: LayerKind) {
  return KIND_LABEL[kind];
}

/** Infers the layer kind of an object that has no `samaKind` yet. */
export function inferKind(obj: FabricObject): LayerKind {
  if (obj.samaKind) return obj.samaKind;
  if (obj instanceof PaintLayer) return 'paint';
  if (obj instanceof Group) return 'group';
  if (obj instanceof IText) return 'text';
  if (obj instanceof FabricImage) return 'image';
  if (obj instanceof Rect) return 'rect';
  if (obj instanceof Ellipse) return 'ellipse';
  if (obj instanceof Line) return 'line';
  if (obj instanceof Polygon) return 'polygon';
  if (obj instanceof Path) return 'path';
  return 'path';
}

/** Children of an object as seen by the layers panel (paint layers are leaves). */
export function layerChildren(obj: FabricObject): FabricObject[] | null {
  if (obj instanceof PaintLayer) return null;
  if (obj instanceof Group) return obj.getObjects();
  return null;
}

/**
 * Ensures an object (and its layer children) carry an id, kind and name.
 * `nameCounter` generates "Rectangle 3"-style names.
 */
export function ensureMeta(obj: FabricObject, nameFor: (kind: LayerKind) => string) {
  if (!obj.samaId) obj.samaId = createId();
  if (!obj.samaKind) obj.samaKind = inferKind(obj);
  if (!obj.samaName) obj.samaName = nameFor(obj.samaKind);
  const children = layerChildren(obj);
  children?.forEach((child) => ensureMeta(child, nameFor));
  if (obj instanceof PaintLayer) {
    obj.getObjects().forEach((stroke) => {
      if (!stroke.samaId) stroke.samaId = createId('s');
    });
  }
}

/** Depth-first walk over layer objects (not into paint layers). */
export function walkLayers(
  objects: FabricObject[],
  visit: (obj: FabricObject, parent: Group | null) => void,
  parent: Group | null = null,
) {
  for (const obj of objects) {
    visit(obj, parent);
    const children = layerChildren(obj);
    if (children) walkLayers(children, visit, obj as Group);
  }
}

export function findById(canvas: Canvas, id: string): FabricObject | undefined {
  let found: FabricObject | undefined;
  walkLayers(canvas.getObjects(), (obj) => {
    if (!found && obj.samaId === id) found = obj;
  });
  return found;
}

/** The collection (canvas or group) that directly contains `obj`. */
export function parentOf(obj: FabricObject): Group | null {
  return (obj.parent as Group | undefined) ?? null;
}

/** True when `obj` or any ancestor is locked. */
export function isEffectivelyLocked(obj: FabricObject): boolean {
  let cur: FabricObject | undefined = obj;
  while (cur) {
    if (cur.samaLocked) return true;
    cur = cur.parent as FabricObject | undefined;
  }
  return false;
}

/** True when `obj` and all its ancestors are visible. */
export function isEffectivelyVisible(obj: FabricObject): boolean {
  let cur: FabricObject | undefined = obj;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parent as FabricObject | undefined;
  }
  return true;
}

/**
 * Applies interactivity flags implied by the lock state to `obj` and its
 * descendants. Locked layers can still be selected from the layers panel (so
 * you can rename or unlock them) but cannot be moved, resized or rotated.
 */
export function applyLockState(obj: FabricObject, inheritedLock = false) {
  const locked = inheritedLock || !!obj.samaLocked;
  obj.set({
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockRotation: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    hasControls: !locked,
  });
  const children = layerChildren(obj);
  children?.forEach((child) => applyLockState(child, locked));
}

/** Builds the layers-panel tree (top-most first) from the canvas objects. */
export function buildLayerTree(objects: FabricObject[]): LayerNode[] {
  const nodes: LayerNode[] = [];
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!obj.samaId) continue;
    const children = layerChildren(obj);
    nodes.push({
      id: obj.samaId,
      name: obj.samaName ?? kindLabel(inferKind(obj)),
      kind: inferKind(obj),
      visible: obj.visible,
      locked: !!obj.samaLocked,
      opacity: obj.opacity,
      blendMode: (obj.globalCompositeOperation as BlendMode) || 'source-over',
      ...(children ? { children: buildLayerTree(children) } : {}),
    });
  }
  return nodes;
}

/** Collects every layer id in a subtree (including the root). */
export function collectIds(obj: FabricObject, into: string[] = []) {
  if (obj.samaId) into.push(obj.samaId);
  layerChildren(obj)?.forEach((c) => collectIds(c, into));
  return into;
}

/** Assigns fresh ids to an object tree (used by duplicate/paste). */
export function reassignIds(obj: FabricObject) {
  obj.samaId = createId(obj.parent instanceof PaintLayer ? 's' : 'l');
  if (obj instanceof Group) obj.getObjects().forEach(reassignIds);
}

/** True for objects whose anchors can be edited with the Direct Selection tool. */
export function isAnchorEditable(obj: FabricObject | undefined | null): boolean {
  if (!obj) return false;
  if (obj instanceof Polygon) return true;
  return obj instanceof Path && obj.type !== 'BrushStroke';
}
