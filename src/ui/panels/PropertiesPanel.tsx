/**
 * Properties panel ("Design" tab): shows and edits the selection. With
 * nothing selected it shows the document (artboard) settings.
 */
import { useState } from 'react';
import { Italic, Link, Link2Off, PenLine, RotateCw, Spline } from 'lucide-react';
import { useEditor, useWorkspace } from '../../workspace/context';
import { useT } from '../../i18n';
import { NumberField } from '../controls/NumberField';
import { Slider } from '../controls/Slider';
import { ColorField } from '../controls/ColorField';
import { Select } from '../controls/Select';
import { IconButton } from '../controls/IconButton';
import { FontControls, TextAlignButtons, DirectionToggle } from './TextControls';
import { KindIcon } from './KindIcon';
import { BLEND_MODES } from './blendModes';
import type { SelectionInfo, SelectionPatch } from '../../editor/types';

export function PropertiesPanel() {
  const selection = useWorkspace((s) => s.selection);
  return (
    <div className="sw-props" data-testid="properties-panel">
      {selection ? <SelectionProps sel={selection} /> : <DocumentProps />}
    </div>
  );
}

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="sw-section">
      <header className="sw-section__header">
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="sw-section__body">{children}</div>
    </section>
  );
}

function DocumentProps() {
  const editor = useEditor();
  const t = useT();
  const doc = useWorkspace((s) => s.doc);
  const count = useWorkspace((s) => s.layers.length);
  return (
    <>
      <Section title={t('props.document')}>
        <div className="sw-grid2">
          <NumberField label="W" title={t('props.width')} value={doc.width} min={1} max={10000} onChange={(v, f) => f && editor?.resizeArtboard(v, doc.height)} />
          <NumberField label="H" title={t('props.height')} value={doc.height} min={1} max={10000} onChange={(v, f) => f && editor?.resizeArtboard(doc.width, v)} />
        </div>
        <div className="sw-row">
          <span className="sw-row__label">{t('props.background')}</span>
          <ColorField value={doc.background} allowNone onChange={(c, final) => editor?.setDocument({ background: c }, { commit: final })} />
        </div>
      </Section>
      <div className="sw-empty-hint">
        <p>{count ? t('props.nothingSelected') : t('props.emptyDocument')}</p>
      </div>
    </>
  );
}

function SelectionProps({ sel }: { sel: SelectionInfo }) {
  const editor = useEditor();
  const t = useT();
  const [lockRatio, setLockRatio] = useState(true);
  const update = (patch: SelectionPatch, final = true, label?: string) =>
    void editor?.updateSelection(patch, { commit: final, label });
  const locked = sel.locked;

  const setSize = (dim: 'width' | 'height', v: number, final: boolean) => {
    if (lockRatio && sel.width && sel.height) {
      const ratio = sel.width / sel.height;
      update(dim === 'width' ? { width: v, height: v / ratio } : { height: v, width: v * ratio }, final, 'Resize');
    } else update({ [dim]: v }, final, 'Resize');
  };

  const hasPaint = sel.fill !== undefined || sel.stroke !== undefined;

  return (
    <>
      <div className="sw-props__title">
        {sel.kind !== 'multiple' && <KindIcon kind={sel.kind} />}
        <span>{sel.count > 1 ? t('props.multiple', { count: sel.count }) : sel.name}</span>
        {locked && <span className="sw-badge">{t('layers.locked')}</span>}
      </div>

      <Section title={t('props.transform')}>
        <div className="sw-grid2">
          <NumberField label="X" value={sel.x} precision={1} disabled={locked} onChange={(v, f) => update({ x: v }, f, 'Move')} />
          <NumberField label="Y" value={sel.y} precision={1} disabled={locked} onChange={(v, f) => update({ y: v }, f, 'Move')} />
          <NumberField label="W" value={sel.width} precision={1} min={0.1} disabled={locked} onChange={(v, f) => setSize('width', v, f)} />
          <NumberField label="H" value={sel.height} precision={1} min={0.1} disabled={locked} onChange={(v, f) => setSize('height', v, f)} />
        </div>
        <div className="sw-grid2">
          <NumberField
            label={<RotateCw size={12} />}
            title={t('props.rotation')}
            value={sel.angle}
            precision={1}
            suffix="°"
            disabled={locked}
            onChange={(v, f) => update({ angle: ((v % 360) + 360) % 360 }, f, 'Rotate')}
          />
          <IconButton
            size="sm"
            label={lockRatio ? t('props.ratioLocked') : t('props.ratioUnlocked')}
            active={lockRatio}
            onClick={() => setLockRatio((v) => !v)}
          >
            {lockRatio ? <Link size={14} /> : <Link2Off size={14} />}
          </IconButton>
        </div>
      </Section>

      {sel.count === 1 && (
        <Section title={t('props.layer')}>
          <Slider
            label={t('props.opacity')}
            value={Math.round(sel.opacity * 100)}
            min={0}
            max={100}
            format={(v) => `${v}%`}
            onChange={(v, f) => update({ opacity: v / 100 }, f, 'Opacity')}
          />
          <Select
            label={t('props.blend')}
            value={sel.blendMode}
            options={BLEND_MODES.map((m) => ({ value: m, label: t(`blend.${m}`) }))}
            onChange={(v) => update({ blendMode: v }, true, 'Blend mode')}
          />
        </Section>
      )}

      {sel.count === 1 && sel.text && (
        <Section title={t('props.text')}>
          <FontControls
            fontFamily={sel.text.fontFamily}
            fontWeight={sel.text.fontWeight}
            fontSize={sel.text.fontSize}
            onChange={(p) => update(p, true, 'Text style')}
          />
          <div className="sw-row sw-row--wrap">
            <TextAlignButtons value={sel.text.textAlign} onChange={(v) => update({ textAlign: v }, true, 'Text style')} />
            <IconButton
              size="sm"
              label={t('props.italic')}
              active={sel.text.fontStyle === 'italic'}
              onClick={() => update({ fontStyle: sel.text!.fontStyle === 'italic' ? 'normal' : 'italic' }, true, 'Text style')}
            >
              <Italic size={15} />
            </IconButton>
            <DirectionToggle value={sel.text.direction} onChange={(v) => update({ direction: v }, true, 'Text direction')} />
          </div>
          <div className="sw-grid2">
            <NumberField
              label={t('props.lineHeightShort')}
              title={t('props.lineHeight')}
              value={sel.text.lineHeight}
              precision={2}
              step={0.05}
              min={0.5}
              max={5}
              onChange={(v, f) => update({ lineHeight: v }, f, 'Text style')}
            />
            <NumberField
              label={t('props.letterSpacingShort')}
              title={t('props.letterSpacing')}
              value={sel.text.charSpacing}
              step={10}
              min={-500}
              max={2000}
              onChange={(v, f) => update({ charSpacing: v }, f, 'Text style')}
            />
          </div>
          <div className="sw-row">
            <span className="sw-row__label">{t('props.color')}</span>
            <ColorField value={sel.fill ?? '#000000'} onChange={(c, f) => c && update({ fill: c }, f, 'Text color')} />
          </div>
        </Section>
      )}

      {sel.count === 1 && hasPaint && !sel.text && sel.kind !== 'paint' && (
        <Section title={t('props.appearance')}>
          <div className="sw-row">
            <span className="sw-row__label">{t('props.fill')}</span>
            <ColorField value={sel.fill} allowNone onChange={(c, f) => update({ fill: c }, f, 'Fill')} />
          </div>
          <div className="sw-row">
            <span className="sw-row__label">{t('props.stroke')}</span>
            <ColorField value={sel.stroke} allowNone onChange={(c, f) => update({ stroke: c }, f, 'Stroke')} />
          </div>
          <div className="sw-grid2">
            <NumberField
              label={t('props.strokeWidthShort')}
              title={t('props.strokeWidth')}
              value={sel.strokeWidth}
              min={0}
              max={500}
              precision={1}
              suffix="px"
              onChange={(v, f) => update({ strokeWidth: v }, f, 'Stroke width')}
            />
            {sel.cornerRadius !== undefined && (
              <NumberField
                label={t('props.radiusShort')}
                title={t('props.cornerRadius')}
                value={sel.cornerRadius}
                min={0}
                max={5000}
                suffix="px"
                onChange={(v, f) => update({ cornerRadius: v }, f, 'Corner radius')}
              />
            )}
            {sel.sides !== undefined && (
              <NumberField label={t('props.sides')} value={sel.sides} min={3} max={64} onChange={(v, f) => f && update({ sides: v }, true, 'Polygon sides')} />
            )}
          </div>
        </Section>
      )}

      {sel.count === 1 && sel.kind === 'paint' && (
        <Section title={t('props.paint')}>
          <div className="sw-row">
            <span className="sw-row__label">{t('props.brushColor')}</span>
            <ColorField value={sel.stroke} onChange={(c, f) => c && update({ stroke: c }, f, 'Recolor paint')} />
          </div>
          <p className="sw-note">{t('props.paintNote')}</p>
        </Section>
      )}

      {sel.count === 1 && sel.image && (
        <Section title={t('props.image')}>
          <p className="sw-note">
            {sel.image.fileName && <>{sel.image.fileName} · </>}
            {sel.image.naturalWidth} × {sel.image.naturalHeight}px
          </p>
          <button
            type="button"
            className="sw-btn"
            onClick={() => update({ width: sel.image!.naturalWidth, height: sel.image!.naturalHeight }, true, 'Reset image size')}
          >
            {t('props.resetImageSize')}
          </button>
        </Section>
      )}

      {sel.count === 1 && (sel.hasAnchors || ['rect', 'ellipse', 'polygon'].includes(sel.kind)) && (
        <Section title={t('props.vector')}>
          {sel.hasAnchors ? (
            <button
              type="button"
              className="sw-btn"
              disabled={locked}
              onClick={() => {
                editor?.setTool('direct');
              }}
            >
              <PenLine size={14} /> {t('props.editAnchors')}
            </button>
          ) : null}
          {['rect', 'ellipse', 'polygon'].includes(sel.kind) && (
            <button type="button" className="sw-btn" disabled={locked} onClick={() => editor?.convertSelectionToPath()}>
              <Spline size={14} /> {t('menu.convertToPath')}
            </button>
          )}
        </Section>
      )}
    </>
  );
}
