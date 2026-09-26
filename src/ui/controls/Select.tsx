interface SelectProps<T extends string | number> {
  value: T;
  options: { value: T; label: string; style?: React.CSSProperties }[];
  onChange: (value: T) => void;
  label?: string;
  width?: number;
  disabled?: boolean;
  title?: string;
}

/** Native select, styled for the dark theme (keyboard/screen-reader friendly). */
export function Select<T extends string | number>({ value, options, onChange, label, width, disabled, title }: SelectProps<T>) {
  return (
    <label className="sw-select" style={width ? { width } : undefined} title={title}>
      {label && <span className="sw-select__label">{label}</span>}
      <select
        value={String(value)}
        disabled={disabled}
        aria-label={label ?? title}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} style={o.style}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
