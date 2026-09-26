/**
 * Floating readout for the Color Sampler tool: one row per sample point with
 * its number, a swatch, the hex value and RGB values. Shown in the top corner
 * of the canvas while the tool is active and its points are visible.
 */
import { X } from 'lucide-react';
import { useEditor, useWorkspace } from '../workspace/context';
import { useT } from '../i18n';
import type { ColorSamplerTool } from '../editor/tools/ColorSamplerTool';

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function ColorSamplerPanel() {
  const editor = useEditor();
  const t = useT();
  const tool = useWorkspace((s) => s.activeTool);
  const visible = useWorkspace((s) => s.colorSamplerVisible);
  const samples = useWorkspace((s) => s.colorSamples);
  if (tool !== 'colorSampler' || !visible || !samples.length || !editor) return null;
  const sampler = editor.getTool<ColorSamplerTool>('colorSampler');
  return (
    <div className="sw-sampler" role="region" aria-label={t('colorSampler.title')} data-testid="color-sampler-panel">
      <header className="sw-sampler__header">
        <span>{t('colorSampler.title')}</span>
        <button type="button" className="sw-sampler__clear" onClick={() => sampler.clearSamples()}>
          {t('colorSampler.clear')}
        </button>
      </header>
      <ul>
        {samples.map((s) => (
          <li key={s.id} className="sw-sampler__row" data-testid={`color-sample-${s.id}`}>
            <span className="sw-sampler__num">{s.id}</span>
            <span className={`sw-sampler__swatch${s.color ? '' : ' is-none'}`} style={s.color ? { background: s.color } : undefined} />
            {s.color ? (
              <span className="sw-sampler__value" dir="ltr">
                <strong>{s.color.toUpperCase()}</strong>
                <small>RGB {rgb(s.color)}</small>
              </span>
            ) : (
              <span className="sw-sampler__value sw-sampler__value--none">{t('colorSampler.none')}</span>
            )}
            <button
              type="button"
              className="sw-sampler__remove"
              aria-label={t('colorSampler.remove', { n: s.id })}
              title={t('colorSampler.remove', { n: s.id })}
              onClick={() => sampler.removeSample(s.id)}
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
