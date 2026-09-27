import { useRef } from 'react';
import { Download, Redo2, Undo2 } from 'lucide-react';
import { useEditor, useWorkspace } from '../workspace/context';
import { useT } from '../i18n';
import { MenuBar, type MenuDef } from './controls/Menu';
import { IconButton } from './controls/IconButton';
import { formatShortcut } from './shortcuts';

export interface TopBarActions {
  newDocument: () => void;
  openDocument: () => void;
  saveDocument: () => void;
  importImage: () => void;
  documentSetup: () => void;
  exportDialog: () => void;
  exportJson: () => void;
  showShortcuts: () => void;
}

export function TopBar({ actions, extra }: { actions: TopBarActions; extra?: React.ReactNode }) {
  const editor = useEditor();
  const t = useT();
  const history = useWorkspace((s) => s.history);
  const zoom = useWorkspace((s) => s.zoom);
  const doc = useWorkspace((s) => s.doc);
  const selection = useWorkspace((s) => s.selection);
  const region = useWorkspace((s) => s.pixelSelection);
  const view = {
    rulers: useWorkspace((s) => s.showRulers),
    guides: useWorkspace((s) => s.showGuides),
    snapping: useWorkspace((s) => s.snapping),
  };
  const nameRef = useRef<HTMLInputElement>(null);
  const k = formatShortcut;
  const has = !!selection;

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { label: t('menu.new'), onSelect: actions.newDocument },
        { label: t('menu.open'), shortcut: k('Mod+O'), onSelect: actions.openDocument },
        { label: t('menu.save'), shortcut: k('Mod+S'), onSelect: actions.saveDocument },
        { type: 'separator' },
        { label: t('menu.importImage'), shortcut: k('Mod+Shift+I'), onSelect: actions.importImage },
        { label: t('menu.documentSetup'), onSelect: actions.documentSetup },
        { type: 'separator' },
        { label: t('menu.exportPng'), shortcut: k('Mod+Shift+E'), onSelect: actions.exportDialog },
        { label: t('menu.exportJson'), onSelect: actions.exportJson },
      ],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        { label: t('menu.undo'), shortcut: k('Mod+Z'), disabled: !history.canUndo, onSelect: () => editor?.undo() },
        { label: t('menu.redo'), shortcut: k('Mod+Shift+Z'), disabled: !history.canRedo, onSelect: () => editor?.redo() },
        { type: 'separator' },
        { label: t('menu.cut'), shortcut: k('Mod+X'), disabled: !has, onSelect: () => editor?.cutSelection() },
        { label: t('menu.copy'), shortcut: k('Mod+C'), disabled: !has, onSelect: () => editor?.copySelection() },
        { label: t('menu.paste'), shortcut: k('Mod+V'), disabled: !editor?.hasClipboard(), onSelect: () => void editor?.paste() },
        { label: t('menu.duplicate'), shortcut: k('Mod+J'), disabled: !has, onSelect: () => void editor?.duplicateSelection() },
        { label: t('menu.delete'), shortcut: 'Del', disabled: !has, onSelect: () => editor?.deleteSelection() },
        { type: 'separator' },
        { label: t('menu.selectAll'), shortcut: k('Mod+A'), onSelect: () => editor?.selectAll() },
        {
          label: t('menu.deselect'),
          shortcut: k('Mod+Shift+A'),
          disabled: !has && !region,
          onSelect: () => {
            editor?.clearSelection();
            editor?.clearPixelSelection();
          },
        },
      ],
    },
    {
      id: 'object',
      label: t('menu.object'),
      items: [
        { label: t('menu.group'), shortcut: k('Mod+G'), disabled: (selection?.count ?? 0) < 2, onSelect: () => editor?.groupSelection() },
        { label: t('menu.ungroup'), shortcut: k('Mod+Shift+G'), disabled: selection?.kind !== 'group', onSelect: () => editor?.ungroupSelection() },
        { type: 'separator' },
        { label: t('menu.bringToFront'), shortcut: k('Mod+Shift+]'), disabled: !has, onSelect: () => editor?.arrange('front') },
        { label: t('menu.bringForward'), shortcut: k('Mod+]'), disabled: !has, onSelect: () => editor?.arrange('forward') },
        { label: t('menu.sendBackward'), shortcut: k('Mod+['), disabled: !has, onSelect: () => editor?.arrange('backward') },
        { label: t('menu.sendToBack'), shortcut: k('Mod+Shift+['), disabled: !has, onSelect: () => editor?.arrange('back') },
        { type: 'separator' },
        { label: t('menu.flipH'), disabled: !has, onSelect: () => editor?.flipSelection('x') },
        { label: t('menu.flipV'), disabled: !has, onSelect: () => editor?.flipSelection('y') },
        { type: 'separator' },
        {
          label: t('menu.convertToPath'),
          disabled: !selection || !['rect', 'ellipse', 'polygon'].includes(selection.kind),
          onSelect: () => editor?.convertSelectionToPath(),
        },
        { label: t('menu.newPaintLayer'), onSelect: () => editor?.addPaintLayer() },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        { label: t('menu.zoomIn'), shortcut: k('Mod+='), onSelect: () => editor?.zoomStep(1) },
        { label: t('menu.zoomOut'), shortcut: k('Mod+-'), onSelect: () => editor?.zoomStep(-1) },
        { label: t('menu.fit'), shortcut: k('Mod+0'), onSelect: () => editor?.fitToScreen() },
        { label: t('menu.actualSize'), shortcut: k('Mod+1'), onSelect: () => editor?.zoomToActualSize() },
        { label: t('menu.zoomSelection'), shortcut: k('Mod+2'), disabled: !has, onSelect: () => editor?.zoomToSelection() },
        { type: 'separator' },
        { label: t('menu.rulers'), shortcut: k('Mod+R'), checked: view.rulers, onSelect: () => editor?.toggleView('showRulers') },
        { label: t('menu.guides'), shortcut: k('Mod+;'), checked: view.guides, onSelect: () => editor?.toggleView('showGuides') },
        { label: t('menu.snapping'), checked: view.snapping, onSelect: () => editor?.toggleView('snapping') },
        { label: t('menu.clearGuides'), onSelect: () => editor?.clearGuides() },
      ],
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: [{ label: t('menu.shortcuts'), shortcut: '?', onSelect: actions.showShortcuts }],
    },
  ];

  return (
    <header className="sw-topbar">
      <div className="sw-brand" aria-label="Sama">
        <span className="sw-brand__mark">س</span>
        <span className="sw-brand__name">{t('app.name')}</span>
      </div>
      <MenuBar menus={menus} />
      <div className="sw-topbar__doc">
        <input
          ref={nameRef}
          className="sw-docname"
          value={doc.name}
          aria-label={t('props.documentName')}
          onChange={(e) => editor?.setDocument({ name: e.target.value }, { commit: false })}
          onBlur={() => editor?.commit('Rename document')}
          onKeyDown={(e) => e.key === 'Enter' && nameRef.current?.blur()}
        />
        <span className="sw-docsize">
          {doc.width} × {doc.height}
        </span>
      </div>
      <div className="sw-topbar__right">
        <IconButton label={t('menu.undo')} shortcut={k('Mod+Z')} disabled={!history.canUndo} onClick={() => editor?.undo()} data-testid="undo">
          <Undo2 size={17} />
        </IconButton>
        <IconButton label={t('menu.redo')} shortcut={k('Mod+Shift+Z')} disabled={!history.canRedo} onClick={() => editor?.redo()} data-testid="redo">
          <Redo2 size={17} />
        </IconButton>
        <button type="button" className="sw-zoom-btn" onClick={() => editor?.fitToScreen()} title={t('menu.fit')} data-testid="zoom-level">
          {Math.round(zoom * 100)}%
        </button>
        {extra}
        <button type="button" className="sw-btn sw-btn--primary" onClick={actions.exportDialog} data-testid="export-button">
          <Download size={15} /> {t('export.button')}
        </button>
      </div>
    </header>
  );
}
