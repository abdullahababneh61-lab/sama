import { Modal } from './Modal';
import { useT } from '../../i18n';
import { formatShortcut, SHORTCUT_REFERENCE } from '../shortcuts';

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t('menu.shortcuts')} onClose={onClose} width={760}>
      <div className="sw-shortcuts">
        {SHORTCUT_REFERENCE.map((g) => (
          <section key={g.title}>
            <h3>{t(g.title)}</h3>
            <dl>
              {g.items.map((i) => (
                <div key={i.keys + i.label} className="sw-shortcuts__row">
                  <dt>{t(i.label)}</dt>
                  <dd dir="ltr">
                    <kbd>{formatShortcut(i.keys)}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
