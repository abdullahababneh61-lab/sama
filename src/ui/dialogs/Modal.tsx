import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '../../i18n';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** Centered modal dialog with focus trapping-lite and Escape to close. */
export function Modal({ title, onClose, children, footer, width = 440 }: ModalProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, button:not(.sw-modal__close)')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sw-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sw-modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }} ref={ref}>
        <header className="sw-modal__header">
          <h2>{title}</h2>
          <button type="button" className="sw-modal__close" aria-label={t('dialog.close')} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="sw-modal__body">{children}</div>
        {footer && <footer className="sw-modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}
