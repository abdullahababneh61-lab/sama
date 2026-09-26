import { useWorkspace } from '../workspace/context';
import { useT } from '../i18n';

export function StatusBar() {
  const t = useT();
  const pointer = useWorkspace((s) => s.pointer);
  const zoom = useWorkspace((s) => s.zoom);
  const count = useWorkspace((s) => s.selection?.count ?? 0);
  const layers = useWorkspace((s) => s.layers.length);
  const editingPath = useWorkspace((s) => s.editingPathId);
  return (
    <footer className="sw-statusbar">
      <span>{editingPath ? t('status.editingAnchors') : count ? t('status.selected', { count }) : t('status.layers', { count: layers })}</span>
      <span className="sw-statusbar__spacer" />
      <span className="sw-statusbar__mono" dir="ltr">
        {pointer ? `X ${pointer.x}  Y ${pointer.y}` : '—'}
      </span>
      <span className="sw-statusbar__mono" dir="ltr">{Math.round(zoom * 100)}%</span>
    </footer>
  );
}
