interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number, final: boolean) => void;
  /** Formats the value readout (e.g. as a percentage). */
  format?: (v: number) => string;
  disabled?: boolean;
  width?: number;
}

/** Range slider with a value readout. `final` is true on release. */
export function Slider({ label, value, min, max, step = 1, onChange, format, disabled, width }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`sw-slider${disabled ? ' is-disabled' : ''}`} style={width ? { width } : undefined}>
      {label && <span className="sw-slider__label">{label}</span>}
      <input
        type="range"
        className="sw-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value), false)}
        onPointerUp={(e) => onChange(Number((e.target as HTMLInputElement).value), true)}
        onKeyUp={(e) => onChange(Number((e.target as HTMLInputElement).value), true)}
      />
      <span className="sw-slider__value">{format ? format(value) : value}</span>
    </div>
  );
}
