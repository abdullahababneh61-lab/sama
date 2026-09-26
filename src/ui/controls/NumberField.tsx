import { useEffect, useRef, useState, type ReactNode } from 'react';

interface NumberFieldProps {
  /** Short label or icon; drag it horizontally to scrub the value. */
  label: ReactNode;
  value: number | undefined;
  onChange: (value: number, final: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places shown. */
  precision?: number;
  suffix?: string;
  disabled?: boolean;
  title?: string;
  width?: number;
}

const clamp = (v: number, min?: number, max?: number) =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

/**
 * Numeric input in the style of professional design tools: type a value
 * (simple arithmetic like `120+24` works), use ↑/↓ (Shift = ×10), or drag the
 * label to scrub.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 0,
  suffix,
  disabled,
  title,
  width,
}: NumberFieldProps) {
  const format = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '' : String(Number(v.toFixed(precision))));
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);
  const scrub = useRef<{ x: number; start: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!focused) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, precision]);

  const commitText = () => {
    const parsed = evaluate(text);
    if (parsed === null) {
      setText(format(value));
      return;
    }
    const v = clamp(parsed, min, max);
    setText(format(v));
    if (v !== value) onChange(v, true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || value === undefined) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrub.current = { x: e.clientX, start: value, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 2) s.moved = true;
    if (!s.moved) return;
    const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = clamp(s.start + Math.round(dx) * step * factor, min, max);
    onChange(Number(v.toFixed(Math.max(precision, 2))), false);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = scrub.current;
    scrub.current = null;
    if (s?.moved) {
      const dx = e.clientX - s.x;
      const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      onChange(Number(clamp(s.start + Math.round(dx) * step * factor, min, max).toFixed(Math.max(precision, 2))), true);
    }
  };

  return (
    <label className={`sw-number${disabled ? ' is-disabled' : ''}`} title={title} style={width ? { width } : undefined}>
      <span
        className="sw-number__label"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {label}
      </span>
      <input
        className="sw-number__input"
        value={text}
        disabled={disabled || value === undefined}
        inputMode="decimal"
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commitText();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitText();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setText(format(value));
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = evaluate(text) ?? value ?? 0;
            const v = clamp(base + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), min, max);
            setText(format(v));
            onChange(v, true);
          }
        }}
      />
      {suffix && <span className="sw-number__suffix">{suffix}</span>}
    </label>
  );
}

/**
 * Evaluates a tiny arithmetic expression like "100/2+8" (+, -, *, /,
 * parentheses). Implemented as a small parser rather than `eval` so it works
 * under strict Content-Security-Policies. Arabic-Indic digits are accepted.
 */
export function evaluate(input: string): number | null {
  const s = input
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660));
  if (!s) return null;
  let i = 0;
  const peek = () => s[i];
  const number = (): number => {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
    if (!m) throw new Error('number expected');
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const factor = (): number => {
    if (peek() === '-') {
      i++;
      return -factor();
    }
    if (peek() === '+') {
      i++;
      return factor();
    }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error(') expected');
      i++;
      return v;
    }
    return number();
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = expr();
    return i === s.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
