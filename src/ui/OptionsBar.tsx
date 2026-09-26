/**
 * Contextual options bar under the top bar (like Photoshop's): shows the
 * settings of the active tool.
 */
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Ungroup,
} from 'lucide-react';
import { useEditor, useWorkspace } from '../workspace/context';
import type { CountTool } from '../editor/tools/CountTool';
import { useT } from '../i18n';
import { NumberField } from './controls/NumberField';
import { Slider } from './controls/Slider';
import { ColorField } from './controls/ColorField';
import { IconButton } from './controls/IconButton';
import { FontControls, TextAlignButtons, DirectionToggle } from './panels/TextControls';

export function OptionsBar() {
  const tool = useWorkspace((s) => s.activeTool);
  const t = useT();
  const content = (() => {
    switch (tool) {
      case 'select':
      case 'direct':
        return <SelectOptions />;
      case 'brush':
        return <BrushOptions />;
      case 'eraser':
        return <EraserOptions />;
      case 'pen':
        return <PenOptions />;
      case 'text':
        return <TextOptions />;
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'polygon':
        return <ShapeOptions />;
      case 'hand':
      case 'zoom':
        return <ViewOptions />;
      case 'count':
        return <CountOptions />;
    }
  })();
  return (
    <div className="sw-options" role="toolbar" aria-label={t('options.label')}>
      <span className="sw-options__tool">{t(`tool.${tool}`)}</span>
      <span className="sw-options__sep" />
      {content}
      <span className="sw-options__hint">{t(`hint.${tool}`)}</span>
    </div>
  );
}

function SelectOptions() {
  const editor = useEditor();
  const t = useT();
  const count = useWorkspace((s) => s.selection?.count ?? 0);
  const kind = useWorkspace((s) => s.selection?.kind);
  const disabled = !count;
  const btn = (label: string, onClick: () => void, icon: React.ReactNode, isDisabled = disabled, shortcut?: string) => (
    <IconButton label={label} shortcut={shortcut} size="sm" disabled={isDisabled} onClick={onClick}>
      {icon}
    </IconButton>
  );
  return (
    <div className="sw-options__group">
      <span className="sw-options__caption">{count > 1 ? t('options.alignSelection') : t('options.alignArtboard')}</span>
      {btn(t('align.left'), () => editor?.alignSelection('left'), <AlignStartVertical size={16} />)}
      {btn(t('align.hcenter'), () => editor?.alignSelection('hcenter'), <AlignCenterVertical size={16} />)}
      {btn(t('align.right'), () => editor?.alignSelection('right'), <AlignEndVertical size={16} />)}
      {btn(t('align.top'), () => editor?.alignSelection('top'), <AlignStartHorizontal size={16} />)}
      {btn(t('align.vcenter'), () => editor?.alignSelection('vcenter'), <AlignCenterHorizontal size={16} />)}
      {btn(t('align.bottom'), () => editor?.alignSelection('bottom'), <AlignEndHorizontal size={16} />)}
      <span className="sw-options__sep" />
      {btn(t('menu.flipH'), () => editor?.flipSelection('x'), <FlipHorizontal2 size={16} />)}
      {btn(t('menu.flipV'), () => editor?.flipSelection('y'), <FlipVertical2 size={16} />)}
      <span className="sw-options__sep" />
      {btn(t('menu.group'), () => editor?.groupSelection(), <Group size={16} />, count < 2, 'Ctrl+G')}
      {btn(t('menu.ungroup'), () => editor?.ungroupSelection(), <Ungroup size={16} />, kind !== 'group', 'Ctrl+Shift+G')}
    </div>
  );
}

function BrushOptions() {
  const editor = useEditor();
  const t = useT();
  const o = useWorkspace((s) => s.toolOptions.brush);
  const set = (patch: Partial<typeof o>) => editor?.updateToolOptions('brush', patch);
  return (
    <div className="sw-options__group">
      <NumberField label={t('options.size')} value={o.size} min={1} max={500} suffix="px" width={96} onChange={(v) => set({ size: v })} />
      <Slider label={t('options.hardness')} value={Math.round(o.hardness * 100)} min={0} max={100} format={(v) => `${v}%`} width={170} onChange={(v) => set({ hardness: v / 100 })} />
      <Slider label={t('options.opacity')} value={Math.round(o.opacity * 100)} min={1} max={100} format={(v) => `${v}%`} width={170} onChange={(v) => set({ opacity: v / 100 })} />
      <Slider label={t('options.smoothing')} value={o.smoothing} min={0} max={10} step={0.5} width={150} onChange={(v) => set({ smoothing: v })} />
      <span className="sw-options__caption">{t('options.color')}</span>
      <ColorField value={o.color} onChange={(c) => c && set({ color: c })} />
    </div>
  );
}

function EraserOptions() {
  const editor = useEditor();
  const t = useT();
  const o = useWorkspace((s) => s.toolOptions.eraser);
  const count = useWorkspace((s) => s.selection?.count ?? 0);
  return (
    <div className="sw-options__group">
      <NumberField label={t('options.size')} value={o.size} min={1} max={500} suffix="px" width={96} onChange={(v) => editor?.updateToolOptions('eraser', { size: v })} />
      <span className="sw-options__caption">{count ? t('options.eraseSelected') : t('options.eraseAll')}</span>
    </div>
  );
}

function PaintOptions({ fill, stroke, strokeWidth, onChange }: {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  onChange: (patch: { fill?: string | null; stroke?: string | null; strokeWidth?: number }) => void;
}) {
  const t = useT();
  return (
    <>
      <span className="sw-options__caption">{t('props.fill')}</span>
      <ColorField value={fill} allowNone onChange={(c) => onChange({ fill: c })} />
      <span className="sw-options__caption">{t('props.stroke')}</span>
      <ColorField value={stroke} allowNone onChange={(c) => onChange({ stroke: c })} />
      <NumberField label={t('props.strokeWidthShort')} value={strokeWidth} min={0} max={200} step={1} suffix="px" width={84} onChange={(v) => onChange({ strokeWidth: v })} />
    </>
  );
}

function PenOptions() {
  const editor = useEditor();
  const o = useWorkspace((s) => s.toolOptions.pen);
  return (
    <div className="sw-options__group">
      <PaintOptions {...o} onChange={(p) => editor?.updateToolOptions('pen', p)} />
    </div>
  );
}

function ShapeOptions() {
  const editor = useEditor();
  const t = useT();
  const tool = useWorkspace((s) => s.activeTool);
  const o = useWorkspace((s) => s.toolOptions.shape);
  const set = (p: Partial<typeof o>) => editor?.updateToolOptions('shape', p);
  return (
    <div className="sw-options__group">
      <PaintOptions fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} onChange={set} />
      {tool === 'rect' && (
        <NumberField label={t('props.radiusShort')} title={t('props.cornerRadius')} value={o.cornerRadius} min={0} max={1000} suffix="px" width={84} onChange={(v) => set({ cornerRadius: v })} />
      )}
      {tool === 'polygon' && (
        <NumberField label={t('props.sides')} value={o.sides} min={3} max={64} width={84} onChange={(v) => set({ sides: Math.round(v) })} />
      )}
    </div>
  );
}

function TextOptions() {
  const editor = useEditor();
  const o = useWorkspace((s) => s.toolOptions.text);
  const set = (p: Partial<typeof o>) => editor?.updateToolOptions('text', p);
  return (
    <div className="sw-options__group">
      <FontControls
        fontFamily={o.fontFamily}
        fontWeight={o.fontWeight}
        fontSize={o.fontSize}
        onChange={(p) => set(p)}
        compact
      />
      <ColorField value={o.fill} onChange={(c) => c && set({ fill: c })} />
      <TextAlignButtons value={o.textAlign} onChange={(textAlign) => set({ textAlign })} />
      <DirectionToggle
        value={o.direction}
        onChange={(direction) =>
          set({
            direction,
            textAlign: direction === 'rtl' && o.textAlign === 'left' ? 'right' : direction === 'ltr' && o.textAlign === 'right' ? 'left' : o.textAlign,
          })
        }
      />
    </div>
  );
}

function ViewOptions() {
  const editor = useEditor();
  const t = useT();
  return (
    <div className="sw-options__group">
      <button type="button" className="sw-btn sw-btn--ghost" onClick={() => editor?.fitToScreen()}>
        {t('menu.fit')}
      </button>
      <button type="button" className="sw-btn sw-btn--ghost" onClick={() => editor?.zoomToActualSize()}>
        {t('menu.actualSize')}
      </button>
      <button type="button" className="sw-btn sw-btn--ghost" onClick={() => editor?.zoomToSelection()}>
        {t('menu.zoomSelection')}
      </button>
    </div>
  );
}

function CountOptions() {
  const editor = useEditor();
  const t = useT();
  const total = useWorkspace((s) => s.countMarkers.length);
  return (
    <div className="sw-options__group">
      <span className="sw-options__caption">{t('count.total')}</span>
      <span className="sw-count-total" data-testid="count-total">
        {total}
      </span>
      <button
        type="button"
        className="sw-btn sw-btn--ghost"
        disabled={!total}
        onClick={() => editor?.getTool<CountTool>('count').clearMarkers()}
      >
        {t('count.clear')}
      </button>
    </div>
  );
}
