import { History as HistoryIcon } from 'lucide-react';
import { useEditor, useWorkspace } from '../../workspace/context';
import { useT } from '../../i18n';

/** List of undo steps; click one to jump back or forward to it. */
export function HistoryPanel() {
  const editor = useEditor();
  const t = useT();
  const { labels, position } = useWorkspace((s) => s.history);
  return (
    <ol className="sw-history" aria-label={t('panel.history')}>
      {labels.map((label, i) => (
        <li key={i}>
          <button
            type="button"
            className={`sw-history__item${i === position ? ' is-current' : ''}${i > position ? ' is-future' : ''}`}
            onClick={() => editor?.goToHistory(i)}
          >
            <HistoryIcon size={13} aria-hidden />
            <span>{t(`history.${label}`)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
