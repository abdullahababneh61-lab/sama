import { useEffect, useRef, useState } from 'react';
import { Popover } from './Popover';
import { formatColor, hsvToRgb, parseColor, rgbToHsv, toHex, type HSVA } from './color';
import { useT } from '../../i18n';

/** A small palette of useful defaults plus recently used colours. */
const SWATCHES = [
  '#000000', '#1f1f24', '#4a4a55', '#8e8e9a', '#d9d9d9', '#ffffff',
  '#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#0090ff',
  '#3e63dd', '#8e4ec6', '#d6409f', '#a18072', '#0d3b66', '#f4d35e',
];
const recent: string[] = [];
function pushRecent(c: string) {
  const i = recent.indexOf(c);
  if (i > -1) recent.splice(i, 1);
  recent.unshift(c);
  recent.length = Math.min(recent.length, 12);
}

interface ColorFieldProps {
  value: string | null | undefined;
  onChange: (value: string | null, final: boolean) => void;
  /** Shows a "none" option (no fill / no stroke). */
  allowNone?: boolean;
  label?: string;
  /** Show the hex text input next to the swatch. */
  showHex?: boolean;
  disabled?: boolean;
}

/** Colour swatch that opens an HSV colour picker with alpha. */
export function ColorField({ value, onChange, allowNone, label, showHex = true, disabled }: ColorFieldProps) {
  const t = useT();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const rgba = parseColor(value ?? null);
  const [hexText, setHexText] = useState(rgba ? toHex(rgba) : '');

  useEffect(() => {
    setHexText(rgba ? toHex(rgba) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const close = () => {
    setOpen(false);
    if (value) pushRecent(value);
  };

  return (
    <div className={`sw-color${disabled ? ' is-disabled' : ''}`}>
      <button
        ref={anchor}
        type="button"
        className={`sw-color__swatch${!rgba ? ' is-none' : ''}`}
        aria-label={label ?? t('color.pick')}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ background: rgba ? formatColor(rgba) : undefined }} />
      </button>
      {showHex && !rgba && <span className="sw-color__none">{t('color.none')}</span>}
      {showHex && rgba && (
        <input
          className="sw-color__hex"
          value={hexText}
          disabled={disabled}
          aria-label={t('color.hex')}
          spellCheck={false}
          onChange={(e) => setHexText(e.target.value.toUpperCase())}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            const p = parseColor(hexText);
            if (p && rgba) onChange(formatColor({ ...p, a: rgba.a }), true);
            else setHexText(rgba ? toHex(rgba) : '');
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      )}
      {showHex && rgba && rgba.a < 1 && <span className="sw-color__alpha">{Math.round(rgba.a * 100)}%</span>}
      <Popover anchor={anchor} open={open} onClose={close} placement="left-start">
        <ColorPicker value={value ?? null} onChange={onChange} allowNone={allowNone} />
      </Popover>
    </div>
  );
}

interface ColorPickerProps {
  value: string | null;
  onChange: (value: string | null, final: boolean) => void;
  allowNone?: boolean;
}

export function ColorPicker({ value, onChange, allowNone }: ColorPickerProps) {
  const t = useT();
  const parsed = parseColor(value);
  const [hsva, setHsva] = useState<HSVA>(() => rgbToHsv(parsed ?? { r: 0, g: 0, b: 0, a: 1 }));
  const [hex, setHex] = useState(parsed ? toHex(parsed) : '000000');

  // Keep local HSV in sync when the value changes externally (keeps hue when grey).
  useEffect(() => {
    const p = parseColor(value);
    if (!p) return;
    const current = formatColor(hsvToRgb(hsva));
    if (current !== formatColor(p)) {
      const next = rgbToHsv(p);
      if (next.s === 0 || next.v === 0) next.h = hsva.h;
      setHsva(next);
    }
    setHex(toHex(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (next: HSVA, final: boolean) => {
    setHsva(next);
    const rgb = hsvToRgb(next);
    setHex(toHex(rgb));
    onChange(formatColor(rgb), final);
  };

  const drag = (el: HTMLElement, e: React.PointerEvent, fn: (x: number, y: number, final: boolean) => void) => {
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }, final: boolean) =>
      fn(
        Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
        Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
        final,
      );
    at(e, false);
    const move = (ev: PointerEvent) => at(ev, false);
    const up = (ev: PointerEvent) => {
      at(ev, true);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const hueColor = formatColor(hsvToRgb({ h: hsva.h, s: 1, v: 1, a: 1 }));
  const solid = formatColor(hsvToRgb({ ...hsva, a: 1 }));

  return (
    <div className="sw-picker" dir="ltr">
      <div
        className="sw-picker__sv"
        style={{ background: hueColor }}
        onPointerDown={(e) => drag(e.currentTarget, e, (x, y, f) => emit({ ...hsva, s: x, v: 1 - y }, f))}
      >
        <div className="sw-picker__sv-white" />
        <div className="sw-picker__sv-black" />
        <div className="sw-picker__thumb" style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%`, background: solid }} />
      </div>
      <div
        className="sw-picker__hue"
        onPointerDown={(e) => drag(e.currentTarget, e, (x, _y, f) => emit({ ...hsva, h: Math.min(359.9, x * 360) }, f))}
      >
        <div className="sw-picker__bar-thumb" style={{ left: `${(hsva.h / 360) * 100}%` }} />
      </div>
      <div
        className="sw-picker__alpha"
        style={{ ['--solid' as string]: solid }}
        onPointerDown={(e) => drag(e.currentTarget, e, (x, _y, f) => emit({ ...hsva, a: Math.round(x * 100) / 100 }, f))}
      >
        <div className="sw-picker__bar-thumb" style={{ left: `${hsva.a * 100}%` }} />
      </div>
      <div className="sw-picker__row">
        <span className="sw-picker__hash">#</span>
        <input
          className="sw-picker__hex"
          value={hex}
          spellCheck={false}
          aria-label={t('color.hex')}
          onChange={(e) => setHex(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const p = parseColor(hex);
              if (p) emit(rgbToHsv({ ...p, a: hsva.a }), true);
            }
          }}
          onBlur={() => {
            const p = parseColor(hex);
            if (p) emit(rgbToHsv({ ...p, a: hsva.a }), true);
          }}
        />
        <span className="sw-picker__pct">{Math.round(hsva.a * 100)}%</span>
        {'EyeDropper' in window && (
          <button
            type="button"
            className="sw-picker__eyedrop"
            title={t('color.eyedropper')}
            onClick={async () => {
              try {
                const res = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open();
                const p = parseColor(res.sRGBHex);
                if (p) emit(rgbToHsv({ ...p, a: hsva.a }), true);
              } catch {
                /* cancelled */
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>
          </button>
        )}
      </div>
      <div className="sw-picker__swatches">
        {allowNone && (
          <button type="button" className="sw-picker__swatch is-none" title={t('color.none')} onClick={() => onChange(null, true)} />
        )}
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            className="sw-picker__swatch"
            style={{ background: c }}
            title={c}
            onClick={() => emit(rgbToHsv({ ...parseColor(c)!, a: hsva.a }), true)}
          />
        ))}
      </div>
      {recent.length > 0 && (
        <div className="sw-picker__swatches sw-picker__recent">
          {recent.map((c) => (
            <button key={c} type="button" className="sw-picker__swatch" style={{ background: c }} title={c} onClick={() => onChange(c, true)} />
          ))}
        </div>
      )}
    </div>
  );
}
