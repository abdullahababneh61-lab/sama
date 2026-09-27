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
  CircleDashed,
  Columns2,
  FlipHorizontal2,
  Rows2,
  SquareDashed,
  Square,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  FlipVertical2,
  Group,
  Grid3x3,
  Ungroup,
} from 'lucide-react';
import { useEditor, useWorkspace } from '../workspace/context';
import type { CountTool } from '../editor/tools/CountTool';
import type { ArtboardTool } from '../editor/tools/ArtboardTool';
import type { SelectionMode, ToolId } from '../editor/types';
import { defaultSelectionMode } from '../editor/selectionModes';
import { toolKey } from './toolDefs';
import { useT } from '../i18n';
import { Arc, PolarGrid, SpiralMode } from './icons';
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
      case 'groupSelection':
        return <SelectOptions />;
      case 'objectSelection':
        return (
          <>
            <SelectionModeButtons />
            <span className="sw-options__sep" />
            <SelectOptions />
          </>
        );
      case 'magicWand':
        return (
          <>
            <SelectionModeButtons />
            <span className="sw-options__sep" />
            <MagicWandOptions />
            <span className="sw-options__sep" />
            <SelectOptions />
          </>
        );
      case 'rectMarquee':
      case 'ellipseMarquee':
      case 'singleRowColumnMarquee':
        return <RegionOptions marquee />;
      case 'lasso':
      case 'polygonalLasso':
      case 'magneticLasso':
        return <RegionOptions />;
      case 'quickSelection':
        return <RegionOptions quickSelection />;
      case 'artboard':
        return <ArtboardOptions />;
      case 'brush':
        return <BrushOptions />;
      case 'eraser':
        return <EraserOptions />;
      case 'pen':
      case 'curvaturePen':
        return <PenOptions />;
      case 'arcSpiral':
        return <ArcSpiralOptions />;
      case 'grid':
        return <GridOptions />;
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
      case 'spotHealingBrush':
      case 'healingBrush':
        return <SpotHealOptions />;
    }
  })();
  return (
    <div className="sw-options" role="toolbar" aria-label={t('options.label')}>
      <span className="sw-options__tool">{t(`tool.${toolKey(tool)}`)}</span>
      <span className="sw-options__sep" />
      {content}
      <span className="sw-options__hint">{t(`hint.${toolKey(tool)}`)}</span>
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

/** Stroke colour and width for the line-art tools (always a visible stroke). */
function StrokeOptions({ stroke, strokeWidth, onChange }: { stroke: string; strokeWidth: number; onChange: (p: { stroke?: string; strokeWidth?: number }) => void }) {
  const t = useT();
  return (
    <span className="sw-options__cluster">
      <span className="sw-options__caption">{t('props.stroke')}</span>
      <ColorField value={stroke} onChange={(c) => c && onChange({ stroke: c })} />
      <NumberField label={t('props.strokeWidthShort')} value={strokeWidth} min={0.5} max={200} step={0.5} precision={1} suffix="px" width={84} onChange={(v) => onChange({ strokeWidth: v })} />
    </span>
  );
}

/** Arc / Spiral: the mode switch, spiral turns and the stroke. */
function ArcSpiralOptions() {
  const editor = useEditor();
  const t = useT();
  const o = useWorkspace((s) => s.toolOptions.arcSpiral);
  const set = (p: Partial<typeof o>) => editor?.updateToolOptions('arcSpiral', p);
  return (
    <div className="sw-options__group">
      <span className="sw-options__cluster" role="group" aria-label={t('options.shapeMode')} data-testid="arc-spiral-mode">
        <IconButton label={t('options.arc')} size="sm" active={o.mode === 'arc'} onClick={() => set({ mode: 'arc' })} data-mode="arc">
          <Arc size={16} />
        </IconButton>
        <IconButton label={t('options.spiral')} size="sm" active={o.mode === 'spiral'} onClick={() => set({ mode: 'spiral' })} data-mode="spiral">
          <SpiralMode size={16} />
        </IconButton>
        <span className="sw-options__sep" />
      </span>
      {o.mode === 'spiral' && (
        <span className="sw-options__cluster">
          <NumberField label={t('options.turns')} title={t('options.turnsTitle')} value={o.turns} min={0.5} max={50} step={0.5} precision={1} width={90} onChange={(v) => set({ turns: v })} />
          <span className="sw-options__sep" />
        </span>
      )}
      <StrokeOptions stroke={o.stroke} strokeWidth={o.strokeWidth} onChange={set} />
    </div>
  );
}

/** Grid: the mode switch, rows/columns (or rings/dividers) and the stroke. */
function GridOptions() {
  const editor = useEditor();
  const t = useT();
  const o = useWorkspace((s) => s.toolOptions.grid);
  const set = (p: Partial<typeof o>) => editor?.updateToolOptions('grid', p);
  const count = (label: string, value: number, min: number, onChange: (v: number) => void) => (
    <NumberField label={label} value={value} min={min} max={100} step={1} width={96} onChange={(v) => onChange(Math.round(v))} />
  );
  return (
    <div className="sw-options__group">
      <span className="sw-options__cluster" role="group" aria-label={t('options.shapeMode')} data-testid="grid-mode">
        <IconButton label={t('options.rectGrid')} size="sm" active={o.mode === 'rect'} onClick={() => set({ mode: 'rect' })} data-mode="rect">
          <Grid3x3 size={16} />
        </IconButton>
        <IconButton label={t('options.polarGrid')} size="sm" active={o.mode === 'polar'} onClick={() => set({ mode: 'polar' })} data-mode="polar">
          <PolarGrid size={16} />
        </IconButton>
        <span className="sw-options__sep" />
      </span>
      <span className="sw-options__cluster">
        {o.mode === 'rect' ? (
          <>
            {count(t('options.rows'), o.rows, 1, (rows) => set({ rows }))}
            {count(t('options.columns'), o.columns, 1, (columns) => set({ columns }))}
          </>
        ) : (
          <>
            {count(t('options.rings'), o.rings, 1, (rings) => set({ rings }))}
            {count(t('options.dividers'), o.dividers, 0, (dividers) => set({ dividers }))}
          </>
        )}
        <span className="sw-options__sep" />
      </span>
      <StrokeOptions stroke={o.stroke} strokeWidth={o.strokeWidth} onChange={set} />
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

function SpotHealOptions() {
  const editor = useEditor();
  const t = useT();
  const o = useWorkspace((s) => s.toolOptions.spotHealingBrush);
  return (
    <div className="sw-options__group">
      <NumberField label={t('options.size')} value={o.size} min={1} max={500} suffix="px" width={96} onChange={(v) => editor?.updateToolOptions('spotHealingBrush', { size: v })} />
      <span className="sw-options__caption">{t('options.spotHealImagesOnly')}</span>
    </div>
  );
}

/**
 * Options of the region-selection tools: the marquee shape switch (the
 * three marquee tools and the Row/Column choice), the Quick Selection brush
 * size, and the refine / Invert / Deselect / layer-via-selection actions.
 */
function RegionOptions({ marquee = false, quickSelection = false }: { marquee?: boolean; quickSelection?: boolean }) {
  const editor = useEditor();
  const t = useT();
  const tool = useWorkspace((s) => s.activeTool);
  const orientation = useWorkspace((s) => s.toolOptions.singleRowColumnMarquee.orientation);
  const size = useWorkspace((s) => s.toolOptions.quickSelection.size);
  const sel = useWorkspace((s) => s.pixelSelection);
  const shape = (id: ToolId, label: string, icon: React.ReactNode, active: boolean, onClick: () => void) => (
    <IconButton label={label} size="sm" active={active} onClick={onClick} data-marquee={id}>
      {icon}
    </IconButton>
  );
  const rowCol = (o: 'row' | 'column') => () => {
    editor?.updateToolOptions('singleRowColumnMarquee', { orientation: o });
    editor?.setTool('singleRowColumnMarquee');
  };
  return (
    <div className="sw-options__group">
      <span className="sw-options__cluster">
        <SelectionModeButtons />
        <span className="sw-options__sep" />
      </span>
      {marquee && (
        <span className="sw-options__cluster">
          {shape('rectMarquee', t('tool.rectMarquee'), <SquareDashed size={16} />, tool === 'rectMarquee', () => editor?.setTool('rectMarquee'))}
          {shape('ellipseMarquee', t('tool.ellipseMarquee'), <CircleDashed size={16} />, tool === 'ellipseMarquee', () => editor?.setTool('ellipseMarquee'))}
          {shape('singleRowColumnMarquee', t('options.singleRow'), <Rows2 size={16} />, tool === 'singleRowColumnMarquee' && orientation === 'row', rowCol('row'))}
          {shape('singleRowColumnMarquee', t('options.singleColumn'), <Columns2 size={16} />, tool === 'singleRowColumnMarquee' && orientation === 'column', rowCol('column'))}
          <span className="sw-options__sep" />
        </span>
      )}
      {quickSelection && (
        <span className="sw-options__cluster">
          <NumberField label={t('options.size')} value={size} min={1} max={500} suffix="px" width={96} onChange={(v) => editor?.updateToolOptions('quickSelection', { size: v })} />
          <span className="sw-options__sep" />
        </span>
      )}
      <span className="sw-options__cluster">
        <span className="sw-options__caption sw-options__readout" data-testid="region-size" title={t('options.selectionSizeTitle')}>
          {sel ? t('options.selectionSize', { w: Math.round(sel.width), h: Math.round(sel.height) }) : t('options.noSelection')}
        </span>
        <span className="sw-options__sep" />
      </span>
      <span className="sw-options__cluster">
        <SelectionRefine disabled={!sel} />
        <span className="sw-options__sep" />
      </span>
      <span className="sw-options__cluster">
        <button type="button" className="sw-btn sw-btn--ghost" onClick={() => editor?.invertPixelSelection()}>
          {t('options.invertSelection')}
        </button>
        <button type="button" className="sw-btn sw-btn--ghost" disabled={!sel} title="Ctrl+Shift+A" onClick={() => editor?.clearPixelSelection()}>
          {t('menu.deselect')}
        </button>
        <span className="sw-options__sep" />
      </span>
      <span className="sw-options__cluster">
        <button type="button" className="sw-btn sw-btn--ghost" disabled={!sel} title="Ctrl+Shift+J" onClick={() => void editor?.layerViaSelection('cut')}>
          {t('options.cutToNewLayer')}
        </button>
        <button type="button" className="sw-btn sw-btn--ghost" disabled={!sel} title="Ctrl+J" onClick={() => void editor?.layerViaSelection('copy')}>
          {t('options.copyToNewLayer')}
        </button>
      </span>
    </div>
  );
}

/**
 * New / Add / Subtract / Intersect for the active selecting tool, always
 * first in its options bar. Shift, Alt and Shift+Alt pick the last three
 * for a single click or drag.
 */
function SelectionModeButtons() {
  const editor = useEditor();
  const t = useT();
  const tool = useWorkspace((s) => s.activeTool);
  const mode = useWorkspace((s) => s.toolOptions.selectionModes[tool]) ?? defaultSelectionMode(tool);
  const modes: [SelectionMode, React.ReactNode][] = [
    ['new', <Square key="n" size={16} />],
    ['add', <SquaresUnite key="a" size={16} />],
    ['subtract', <SquaresSubtract key="s" size={16} />],
    ['intersect', <SquaresIntersect key="i" size={16} />],
  ];
  // Quick Selection paints: it can add or take away, not intersect.
  const shown = tool === 'quickSelection' ? modes.slice(0, 3) : modes;
  return (
    <span className="sw-options__cluster" role="group" aria-label={t('options.selectionMode')} data-testid="selection-modes">
      {shown.map(([m, icon]) => (
        <IconButton
          key={m}
          label={t(`options.mode.${m}`)}
          shortcut={m === 'add' ? 'Shift' : m === 'subtract' ? 'Alt' : m === 'intersect' ? 'Shift+Alt' : undefined}
          size="sm"
          active={mode === m}
          onClick={() => editor?.setSelectionMode(tool, m)}
          data-mode={m}
        >
          {icon}
        </IconButton>
      ))}
    </span>
  );
}

/** Feather / Smooth / Expand / Contract — they rewrite the shared selection mask. */
function SelectionRefine({ disabled }: { disabled: boolean }) {
  const editor = useEditor();
  const t = useT();
  const o = useWorkspace((s) => s.toolOptions.selectionRefine);
  const set = (patch: Partial<typeof o>) => editor?.updateToolOptions('selectionRefine', patch);
  const refine = (op: 'feather' | 'smooth' | 'expand' | 'contract', amount: number) => editor?.refinePixelSelection(op, amount);
  return (
    <>
      <button type="button" className="sw-btn sw-btn--ghost" disabled={disabled} onClick={() => refine('feather', o.feather)}>
        {t('options.feather')}
      </button>
      <NumberField label="" title={t('options.featherRadius')} value={o.feather} min={0.5} max={250} step={0.5} suffix="px" width={62} onChange={(v) => set({ feather: v })} />
      <button type="button" className="sw-btn sw-btn--ghost" disabled={disabled} onClick={() => refine('smooth', SMOOTH_RADIUS)}>
        {t('options.smooth')}
      </button>
      <button type="button" className="sw-btn sw-btn--ghost" disabled={disabled} onClick={() => refine('expand', o.amount)}>
        {t('options.expand')}
      </button>
      <button type="button" className="sw-btn sw-btn--ghost" disabled={disabled} onClick={() => refine('contract', o.amount)}>
        {t('options.contract')}
      </button>
      <NumberField label="" title={t('options.modifyAmount')} value={o.amount} min={1} max={500} step={1} suffix="px" width={62} onChange={(v) => set({ amount: Math.round(v) })} />
    </>
  );
}

/** Smooth's sample radius (artboard px): removes jaggies and specks up to this size. */
const SMOOTH_RADIUS = 2;

function MagicWandOptions() {
  const editor = useEditor();
  const t = useT();
  const o = useWorkspace((s) => s.toolOptions.magicWand);
  return (
    <div className="sw-options__group">
      <NumberField label={t('options.tolerance')} value={o.tolerance} min={0} max={255} width={90} onChange={(v) => editor?.updateToolOptions('magicWand', { tolerance: Math.round(v) })} />
      <label className="sw-check sw-check--inline sw-options__check">
        <input type="checkbox" checked={o.contiguous} onChange={(e) => editor?.updateToolOptions('magicWand', { contiguous: e.target.checked })} data-testid="magic-wand-contiguous" />
        {t('options.contiguous')}
      </label>
    </div>
  );
}

function ArtboardOptions() {
  const editor = useEditor();
  const t = useT();
  const selectedId = useWorkspace((s) => s.selectedArtboardId);
  const doc = useWorkspace((s) => s.doc);
  const all = [{ id: 'main', name: doc.name, width: doc.width, height: doc.height }, ...(doc.artboards ?? [])];
  const board = all.find((a) => a.id === selectedId);
  return (
    <div className="sw-options__group">
      <span className="sw-options__caption" data-testid="artboard-count">
        {t('artboard.count', { count: all.length })}
      </span>
      <span className="sw-options__sep" />
      <span className="sw-options__caption">
        {board ? `${board.name} · ${board.width} × ${board.height} px` : t('artboard.noneSelected')}
      </span>
      <button
        type="button"
        className="sw-btn sw-btn--ghost"
        disabled={!board || all.length < 2}
        onClick={() => board && editor?.getTool<ArtboardTool>('artboard').deleteArtboard(board.id)}
      >
        {t('artboard.delete')}
      </button>
    </div>
  );
}
