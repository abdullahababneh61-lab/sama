import { useState } from 'react';
import { Modal } from './Modal';
import { useT } from '../../i18n';
import { NumberField } from '../controls/NumberField';
import { ColorField } from '../controls/ColorField';
import type { DocumentSettings } from '../../editor/types';

export const PRESETS: { key: string; width: number; height: number }[] = [
  { key: 'preset.square', width: 1080, height: 1080 },
  { key: 'preset.portrait', width: 1080, height: 1350 },
  { key: 'preset.story', width: 1080, height: 1920 },
  { key: 'preset.presentation', width: 1920, height: 1080 },
  { key: 'preset.a4', width: 2480, height: 3508 },
  { key: 'preset.poster', width: 3508, height: 4961 },
  { key: 'preset.banner', width: 1500, height: 500 },
  { key: 'preset.logo', width: 1000, height: 1000 },
];

interface DocumentDialogProps {
  mode: 'new' | 'setup';
  initial: DocumentSettings;
  onClose: () => void;
  onConfirm: (settings: DocumentSettings) => void;
}

/** "New document" and "Document setup" (resize artboard / background). */
export function DocumentDialog({ mode, initial, onClose, onConfirm }: DocumentDialogProps) {
  const t = useT();
  const [s, setS] = useState<DocumentSettings>(
    mode === 'new' ? { ...initial, name: t('doc.untitled') } : { ...initial },
  );
  return (
    <Modal
      title={mode === 'new' ? t('menu.new') : t('menu.documentSetup')}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="sw-btn" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="sw-btn sw-btn--primary" onClick={() => onConfirm(s)}>
            {mode === 'new' ? t('doc.create') : t('dialog.apply')}
          </button>
        </>
      }
    >
      {mode === 'new' && (
        <p className="sw-warning">{t('doc.newWarning')}</p>
      )}
      <label className="sw-field">
        <span>{t('props.documentName')}</span>
        <input className="sw-input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </label>
      <div className="sw-presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`sw-preset${s.width === p.width && s.height === p.height ? ' is-active' : ''}`}
            onClick={() => setS({ ...s, width: p.width, height: p.height })}
          >
            <span className="sw-preset__shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
            <span className="sw-preset__name">{t(p.key)}</span>
            <small dir="ltr">
              {p.width} × {p.height}
            </small>
          </button>
        ))}
      </div>
      <div className="sw-grid2">
        <NumberField label="W" title={t('props.width')} value={s.width} min={1} max={10000} suffix="px" onChange={(v) => setS({ ...s, width: Math.round(v) })} />
        <NumberField label="H" title={t('props.height')} value={s.height} min={1} max={10000} suffix="px" onChange={(v) => setS({ ...s, height: Math.round(v) })} />
      </div>
      <div className="sw-row">
        <span className="sw-row__label">{t('props.background')}</span>
        <ColorField value={s.background} allowNone onChange={(c) => setS({ ...s, background: c })} />
      </div>
      {mode === 'setup' && <p className="sw-note">{t('doc.resizeNote')}</p>}
    </Modal>
  );
}
