import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';

export type MenuItem =
  | { type: 'separator' }
  | {
      type?: 'item';
      label: string;
      shortcut?: string;
      onSelect?: () => void;
      disabled?: boolean;
      checked?: boolean;
      danger?: boolean;
      submenu?: MenuItem[];
    };

export interface MenuDef {
  id: string;
  label: string;
  items: MenuItem[];
}

/** Application menu bar (File, Edit, …) with hover-to-switch behaviour. */
export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpenId(null);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [openId]);

  return (
    <div className="sw-menubar" ref={ref} role="menubar">
      {menus.map((m) => (
        <div key={m.id} className="sw-menubar__item">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={openId === m.id}
            className={`sw-menubar__trigger${openId === m.id ? ' is-open' : ''}`}
            onClick={() => setOpenId(openId === m.id ? null : m.id)}
            onPointerEnter={() => openId && setOpenId(m.id)}
          >
            {m.label}
          </button>
          {openId === m.id && <MenuList items={m.items} onDone={() => setOpenId(null)} />}
        </div>
      ))}
    </div>
  );
}

function MenuList({ items, onDone, nested }: { items: MenuItem[]; onDone: () => void; nested?: boolean }) {
  const [sub, setSub] = useState<number | null>(null);
  return (
    <div className={`sw-menu${nested ? ' sw-menu--nested' : ''}`} role="menu">
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={`s${i}`} className="sw-menu__sep" role="separator" />;
        return (
          <div key={item.label} className="sw-menu__wrap" onPointerEnter={() => setSub(item.submenu ? i : null)}>
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`sw-menu__item${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                if (item.submenu) return setSub(i);
                item.onSelect?.();
                onDone();
              }}
            >
              <span className="sw-menu__check">{item.checked && <Check size={13} />}</span>
              <span className="sw-menu__label">{item.label}</span>
              {item.shortcut && <span className="sw-menu__shortcut">{item.shortcut}</span>}
              {item.submenu && <ChevronRight size={13} className="sw-menu__chev" />}
            </button>
            {item.submenu && sub === i && <MenuList items={item.submenu} onDone={onDone} nested />}
          </div>
        );
      })}
    </div>
  );
}
