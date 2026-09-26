import { useEffect, useState } from 'react';
import { useWorkspace } from '../../workspace/context';
import { useT } from '../../i18n';

/** Transient message at the bottom of the canvas (e.g. "Nothing to group"). */
export function Toast() {
  const toast = useWorkspace((s) => s.toast);
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const h = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(h);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className={`sw-toast sw-toast--${toast.tone}`} role="status" aria-live="polite">
      {t(toast.message)}
    </div>
  );
}
