import { useState } from 'react';
import { FileImage, FileJson } from 'lucide-react';
import { Modal } from './Modal';
import { useT } from '../../i18n';
import { useWorkspace } from '../../workspace/context';

export interface ExportRequest {
  png: boolean;
  json: boolean;
  scale: number;
  transparent: boolean;
}

/** Export options: PNG (scale, transparency) and/or the structured JSON document. */
export function ExportDialog({ onClose, onExport }: { onClose: () => void; onExport: (req: ExportRequest) => Promise<void> }) {
  const t = useT();
  const doc = useWorkspace((s) => s.doc);
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(doc.background === null);
  const [png, setPng] = useState(true);
  const [json, setJson] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onExport({ png, json, scale, transparent });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('export.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sw-btn" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="sw-btn sw-btn--primary" disabled={busy || (!png && !json)} onClick={run} data-testid="export-confirm">
            {busy ? t('export.working') : t('export.confirm')}
          </button>
        </>
      }
    >
      <label className="sw-check">
        <input type="checkbox" checked={png} onChange={(e) => setPng(e.target.checked)} />
        <FileImage size={16} />
        <span>
          <strong>{t('export.png')}</strong>
          <small>
            {Math.round(doc.width * scale)} × {Math.round(doc.height * scale)} px
          </small>
        </span>
      </label>
      <div className={`sw-export-opts${png ? '' : ' is-disabled'}`}>
        <div className="sw-segmented">
          {[1, 2, 3].map((s) => (
            <button key={s} type="button" disabled={!png} className={`sw-seg-btn${scale === s ? ' is-active' : ''}`} onClick={() => setScale(s)}>
              {s}×
            </button>
          ))}
        </div>
        <label className="sw-check sw-check--inline">
          <input type="checkbox" disabled={!png} checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
          <span>{t('export.transparent')}</span>
        </label>
      </div>
      <label className="sw-check">
        <input type="checkbox" checked={json} onChange={(e) => setJson(e.target.checked)} />
        <FileJson size={16} />
        <span>
          <strong>{t('export.json')}</strong>
          <small>{t('export.jsonHint')}</small>
        </span>
      </label>
      {error && <p className="sw-error">{error}</p>}
    </Modal>
  );
}
