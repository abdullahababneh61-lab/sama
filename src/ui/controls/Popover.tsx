import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Element popovers are portalled into (inside the workspace root, so styles apply). */
export const PortalContext = createContext<HTMLElement | null>(null);

interface PopoverProps {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  placement?: 'bottom-start' | 'bottom-end' | 'left-start' | 'right-start';
  className?: string;
}

/** Floating panel anchored to an element; closes on outside click or Escape. */
export function Popover({ anchor, open, onClose, children, placement = 'bottom-start', className }: PopoverProps) {
  const portal = useContext(PortalContext);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !ref.current) return;
    const a = anchor.current.getBoundingClientRect();
    const p = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = a.left;
    let top = a.bottom + 6;
    if (placement === 'bottom-end') left = a.right - p.width;
    if (placement === 'left-start') {
      left = a.left - p.width - 8;
      top = a.top;
    }
    if (placement === 'right-start') {
      left = a.right + 8;
      top = a.top;
    }
    left = Math.max(8, Math.min(vw - p.width - 8, left));
    if (top + p.height > vh - 8) top = Math.max(8, vh - p.height - 8);
    setPos({ left, top });
  }, [open, anchor, placement]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open || !portal) return null;
  return createPortal(
    <div
      ref={ref}
      className={`sw-popover${className ? ` ${className}` : ''}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      role="dialog"
    >
      {children}
    </div>,
    portal,
  );
}
