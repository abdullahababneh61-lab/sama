import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react';
import { FONT_FAMILIES, FONT_WEIGHTS } from '../../editor/fonts';
import type { TextAlign, TextDirection } from '../../editor/types';
import { useT } from '../../i18n';
import { IconButton } from '../controls/IconButton';
import { NumberField } from '../controls/NumberField';
import { Select } from '../controls/Select';

interface FontControlsProps {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  onChange: (patch: { fontFamily?: string; fontWeight?: number; fontSize?: number }) => void;
  compact?: boolean;
}

/** Font family, weight and size. Families are previewed in their own face. */
export function FontControls({ fontFamily, fontWeight, fontSize, onChange, compact }: FontControlsProps) {
  const t = useT();
  const families = FONT_FAMILIES.some((f) => f.family === fontFamily)
    ? FONT_FAMILIES
    : [...FONT_FAMILIES, { family: fontFamily, weights: [400], arabic: false, category: 'sans' as const }];
  return (
    <div className={`sw-font${compact ? ' sw-font--compact' : ''}`}>
      <Select
        title={t('props.fontFamily')}
        value={fontFamily}
        width={compact ? 170 : undefined}
        options={families.map((f) => ({
          value: f.family,
          label: f.arabic ? `${f.family}  ·  عربي` : f.family,
          style: { fontFamily: `"${f.family}"` },
        }))}
        onChange={(v) => onChange({ fontFamily: v })}
      />
      <Select
        title={t('props.fontWeight')}
        value={fontWeight}
        width={compact ? 110 : undefined}
        options={FONT_WEIGHTS.map((w) => ({ value: w.value, label: t(`weight.${w.value}`) }))}
        onChange={(v) => onChange({ fontWeight: v })}
      />
      <NumberField
        label={t('props.sizeShort')}
        title={t('props.fontSize')}
        value={fontSize}
        min={1}
        max={2000}
        suffix="px"
        width={compact ? 84 : undefined}
        onChange={(v, final) => final && onChange({ fontSize: v })}
      />
    </div>
  );
}

export function TextAlignButtons({ value, onChange }: { value: TextAlign; onChange: (v: TextAlign) => void }) {
  const t = useT();
  const items: [TextAlign, typeof AlignLeft][] = [
    ['left', AlignLeft],
    ['center', AlignCenter],
    ['right', AlignRight],
    ['justify', AlignJustify],
  ];
  return (
    <div className="sw-segmented" role="radiogroup" aria-label={t('props.align')}>
      {items.map(([v, Icon]) => (
        <IconButton key={v} size="sm" label={t(`textAlign.${v}`)} active={value === v} onClick={() => onChange(v)}>
          <Icon size={15} />
        </IconButton>
      ))}
    </div>
  );
}

export function DirectionToggle({ value, onChange }: { value: TextDirection; onChange: (v: TextDirection) => void }) {
  const t = useT();
  return (
    <div className="sw-segmented" role="radiogroup" aria-label={t('props.direction')}>
      <button type="button" className={`sw-seg-btn${value === 'ltr' ? ' is-active' : ''}`} onClick={() => onChange('ltr')} title={t('props.ltr')}>
        LTR
      </button>
      <button type="button" className={`sw-seg-btn${value === 'rtl' ? ' is-active' : ''}`} onClick={() => onChange('rtl')} title={t('props.rtl')}>
        RTL
      </button>
    </div>
  );
}
