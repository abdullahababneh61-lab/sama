import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label; also shown as a tooltip. */
  label: string;
  /** Optional shortcut hint shown in the tooltip. */
  shortcut?: string;
  active?: boolean;
  tooltipSide?: 'right' | 'bottom' | 'left' | 'top';
  size?: 'sm' | 'md';
  children: ReactNode;
}

/** Square icon button with a tooltip (label + shortcut). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, tooltipSide = 'bottom', size = 'md', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-tooltip={shortcut ? `${label}  ${shortcut}` : label}
      data-tooltip-side={tooltipSide}
      className={`sw-icon-btn sw-icon-btn--${size}${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
});
