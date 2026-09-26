/**
 * Layers panel: the document's layer tree, top-most layer first.
 *
 * - Click to select; Ctrl/Cmd+click to add/remove; Shift+click for a range.
 * - Drag rows to reorder. Drop onto the middle of a group row to move layers
 *   into that group; drop between rows to place them there.
 * - Double-click a name to rename. Eye = visibility, padlock = lock.
 * - Hovering a row outlines the layer on the canvas.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, FolderPlus, Lock, LockOpen, Paintbrush, Trash2 } from 'lucide-react';
import { useEditor, useWorkspace } from '../../workspace/context';
import { useT } from '../../i18n';
import { KindIcon } from './KindIcon';
import { IconButton } from '../controls/IconButton';
import { Slider } from '../controls/Slider';
import { Select } from '../controls/Select';
import { BLEND_MODES } from './blendModes';
import type { LayerNode } from '../../editor/types';

interface Row {
  node: LayerNode;
  depth: number;
  parentId: string | null;
  /** Position in the parent's stacking order (0 = bottom). */
  stackIndex: number;
  expanded: boolean;
  hiddenByParent: boolean;
}

type DropTarget = { rowId: string; position: 'before' | 'after' | 'into' };

function flatten(nodes: LayerNode[], expanded: Set<string>, depth = 0, parentId: string | null = null, hidden = false, out: Row[] = []) {
  nodes.forEach((node, i) => {
    const isExpanded = !!node.children && expanded.has(node.id);
    out.push({ node, depth, parentId, stackIndex: nodes.length - 1 - i, expanded: isExpanded, hiddenByParent: hidden });
    if (node.children && isExpanded) flatten(node.children, expanded, depth + 1, node.id, hidden || !node.visible, out);
  });
  return out;
}

function ancestorsOf(nodes: LayerNode[], id: string, path: string[] = []): string[] | null {
  for (const n of nodes) {
    if (n.id === id) return path;
    if (n.children) {
      const r = ancestorsOf(n.children, id, [...path, n.id]);
      if (r) return r;
    }
  }
  return null;
}

export function LayersPanel() {
  const editor = useEditor();
  const t = useT();
  const layers = useWorkspace((s) => s.layers);
  const selectedIds = useWorkspace((s) => s.selectedIds);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);

  // Reveal selected layers that live inside collapsed groups.
  useEffect(() => {
    const need = new Set<string>();
    for (const id of selectedIds) ancestorsOf(layers, id)?.forEach((a) => need.add(a));
    if ([...need].some((id) => !expanded.has(id))) setExpanded((prev) => new Set([...prev, ...need]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, layers]);

  const rows = useMemo(() => flatten(layers, expanded), [layers, expanded]);
  const orderedIds = rows.map((r) => r.node.id);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.node.id, r])), [rows]);

  useEffect(() => {
    const id = selectedIds[selectedIds.length - 1];
    if (!id) return;
    listRef.current?.querySelector(`[data-row-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIds]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- Drag and drop -------------------------------------------------------
  const startDrag = (e: React.PointerEvent, row: Row) => {
    if (e.button !== 0 || renaming) return;
    const startY = e.clientY;
    const ids = selectedIds.includes(row.node.id) ? selectedIds : [row.node.id];
    let dragging = false;
    let current: DropTarget | null = null;

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientY - startY) < 4) return;
      if (!dragging) {
        dragging = true;
        setDragIds(ids);
      }
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-row-id]');
      if (!el) return;
      const target = rowById.get(el.dataset.rowId!);
      if (!target || ids.includes(target.node.id)) {
        current = null;
        setDrop(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const y = (ev.clientY - r.top) / r.height;
      const isGroup = !!target.node.children;
      const position: DropTarget['position'] = isGroup && y > 0.25 && y < 0.75 ? 'into' : y < 0.5 ? 'before' : 'after';
      current = { rowId: target.node.id, position };
      setDrop(current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragIds(null);
      setDrop(null);
      if (!dragging) return;
      suppressClick.current = true;
      if (!current || !editor) return;
      const target = rowById.get(current.rowId)!;
      if (current.position === 'into' || (current.position === 'after' && target.expanded)) {
        editor.moveLayers(ids, target.node.id, target.node.children?.length ?? 0);
        setExpanded((prev) => new Set([...prev, target.node.id]));
      } else {
        const index = current.position === 'before' ? target.stackIndex + 1 : target.stackIndex;
        editor.moveLayers(ids, target.parentId, index);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onRowClick = (e: React.MouseEvent, row: Row) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const mode = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'replace';
    editor?.selectLayerFromPanel(row.node.id, mode, orderedIds);
  };

  const single = selectedIds.length === 1 ? rowById.get(selectedIds[0])?.node : undefined;

  return (
    <div className="sw-layers" data-testid="layers-panel">
      <div className="sw-layers__controls">
        <Select
          title={t('props.blend')}
          value={single?.blendMode ?? 'source-over'}
          disabled={!single}
          options={BLEND_MODES.map((m) => ({ value: m, label: t(`blend.${m}`) }))}
          onChange={(v) => single && editor?.setLayerProps(single.id, { blendMode: v })}
        />
        <Slider
          label={t('props.opacity')}
          value={Math.round((single?.opacity ?? 1) * 100)}
          min={0}
          max={100}
          disabled={!single}
          format={(v) => `${v}%`}
          onChange={(v, final) => single && editor?.setLayerProps(single.id, { opacity: v / 100 }, { commit: final })}
        />
      </div>

      <div
        className={`sw-layers__list${dragIds ? ' is-dragging' : ''}`}
        ref={listRef}
        role="tree"
        aria-label={t('panel.layers')}
        aria-multiselectable
        onPointerLeave={() => editor?.setHoveredLayer(null)}
      >
        {rows.length === 0 && <p className="sw-layers__empty">{t('layers.empty')}</p>}
        {rows.map((row) => {
          const { node } = row;
          const selected = selectedIds.includes(node.id);
          const dropHere = drop?.rowId === node.id ? drop.position : null;
          return (
            <div
              key={node.id}
              data-row-id={node.id}
              role="treeitem"
              aria-selected={selected}
              aria-expanded={node.children ? row.expanded : undefined}
              aria-level={row.depth + 1}
              className={[
                'sw-layer',
                selected && 'is-selected',
                (!node.visible || row.hiddenByParent) && 'is-hidden',
                node.locked && 'is-locked',
                dragIds?.includes(node.id) && 'is-dragged',
                dropHere && `drop-${dropHere}`,
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ ['--depth' as string]: row.depth }}
              onPointerDown={(e) => startDrag(e, row)}
              onClick={(e) => onRowClick(e, row)}
              onPointerEnter={() => editor?.setHoveredLayer(node.id)}
            >
              <span className="sw-layer__indent" />
              {node.children ? (
                <button
                  type="button"
                  className="sw-layer__chevron"
                  aria-label={row.expanded ? t('layers.collapse') : t('layers.expand')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(node.id);
                  }}
                >
                  {row.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <span className="sw-layer__chevron" />
              )}
              <KindIcon kind={node.kind} />
              {renaming === node.id ? (
                <RenameInput
                  initial={node.name}
                  onDone={(name) => {
                    setRenaming(null);
                    if (name !== null) editor?.setLayerProps(node.id, { name });
                  }}
                />
              ) : (
                <span
                  className="sw-layer__name"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenaming(node.id);
                  }}
                  title={node.name}
                >
                  {node.name}
                </span>
              )}
              {node.opacity < 1 && <span className="sw-layer__meta">{Math.round(node.opacity * 100)}%</span>}
              <button
                type="button"
                className={`sw-layer__toggle${node.locked ? ' is-on' : ''}`}
                aria-label={node.locked ? t('layers.unlock') : t('layers.lock')}
                title={node.locked ? t('layers.unlock') : t('layers.lock')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  editor?.setLayerProps(node.id, { locked: !node.locked });
                }}
              >
                {node.locked ? <Lock size={13} /> : <LockOpen size={13} />}
              </button>
              <button
                type="button"
                className={`sw-layer__toggle${!node.visible ? ' is-on' : ''}`}
                aria-label={node.visible ? t('layers.hide') : t('layers.show')}
                title={node.visible ? t('layers.hide') : t('layers.show')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  editor?.setLayerProps(node.id, { visible: !node.visible });
                }}
              >
                {node.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="sw-layers__footer">
        <IconButton size="sm" label={t('layers.newPaint')} tooltipSide="top" onClick={() => editor?.addPaintLayer()}>
          <Paintbrush size={15} />
        </IconButton>
        <IconButton size="sm" label={t('menu.group')} shortcut="Ctrl+G" tooltipSide="top" disabled={selectedIds.length < 2} onClick={() => editor?.groupSelection()}>
          <FolderPlus size={15} />
        </IconButton>
        <IconButton size="sm" label={t('menu.duplicate')} shortcut="Ctrl+J" tooltipSide="top" disabled={!selectedIds.length} onClick={() => void editor?.duplicateSelection()}>
          <Copy size={15} />
        </IconButton>
        <IconButton size="sm" label={t('menu.delete')} shortcut="Del" tooltipSide="top" disabled={!selectedIds.length} onClick={() => editor?.deleteSelection()}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="sw-layer__rename"
      autoFocus
      value={value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value);
        if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
