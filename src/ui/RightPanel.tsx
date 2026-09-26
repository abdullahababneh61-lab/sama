import { useState } from 'react';
import { History, Layers, SlidersHorizontal } from 'lucide-react';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { LayersPanel } from './panels/LayersPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { useT } from '../i18n';

/** Right-hand dock: properties on top, layers/history tabs below. */
export function RightPanel() {
  const t = useT();
  const [tab, setTab] = useState<'layers' | 'history'>('layers');
  return (
    <aside className="sw-dock" aria-label={t('panel.dock')}>
      <div className="sw-dock__top">
        <div className="sw-dock__header">
          <SlidersHorizontal size={13} />
          <span>{t('panel.properties')}</span>
        </div>
        <div className="sw-dock__scroll">
          <PropertiesPanel />
        </div>
      </div>
      <div className="sw-dock__bottom">
        <div className="sw-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'layers'} className={`sw-tab${tab === 'layers' ? ' is-active' : ''}`} onClick={() => setTab('layers')}>
            <Layers size={13} /> {t('panel.layers')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'history'} className={`sw-tab${tab === 'history' ? ' is-active' : ''}`} onClick={() => setTab('history')}>
            <History size={13} /> {t('panel.history')}
          </button>
        </div>
        <div className="sw-dock__panel">{tab === 'layers' ? <LayersPanel /> : <HistoryPanel />}</div>
      </div>
    </aside>
  );
}
