import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus } from 'lucide-react';
import { IconButton } from './controls/IconButton';
import { Popover } from './controls/Popover';
import { TOOL_GROUPS, toolKey, type ToolSlot } from './toolDefs';
import { useEditor, useWorkspace } from '../workspace/context';
import { useT } from '../i18n';
import type { ToolId } from '../editor/types';

/** How long (ms) the button must be held before a pop-out group opens. */
const HOLD_DELAY = 350;

/** Vertical tool strip on the left (right in RTL). */
export function Toolbar({ onImportImage }: { onImportImage: () => void }) {
  const t = useT();
  return (
    <nav className="sw-toolbar" aria-label={t('toolbar.label')}>
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="sw-toolbar__group">
          {group.map((slot) => (slot.tools.length > 1 ? <ToolGroupButton key={slot.id} slot={slot} /> : <ToolButton key={slot.id} slot={slot} />))}
        </div>
      ))}
      <div className="sw-toolbar__group">
        <IconButton label={t('tool.image')} tooltipSide="right" onClick={onImportImage} data-tool="image">
          <ImagePlus size={18} strokeWidth={1.75} />
        </IconButton>
      </div>
    </nav>
  );
}

function ToolButton({ slot }: { slot: ToolSlot }) {
  const editor = useEditor();
  const active = useWorkspace((s) => s.activeTool);
  const t = useT();
  const tool = slot.tools[0];
  const Icon = tool.icon;
  return (
    <IconButton
      label={t(`tool.${toolKey(tool.id)}`)}
      shortcut={tool.shortcut || undefined}
      tooltipSide="right"
      active={active === tool.id}
      data-tool={tool.id}
      onClick={() => editor?.setTool(tool.id)}
    >
      <Icon size={18} strokeWidth={1.75} />
    </IconButton>
  );
}

/**
 * A Photoshop-style pop-out group: one button for several variants of a tool.
 * - Click: selects the variant shown on the button.
 * - Hold the button, or right-click it: lists all variants; picking one
 *   selects it and makes it the button's face.
 * - Selecting a variant another way (e.g. its keyboard shortcut) also makes
 *   it the face.
 */
function ToolGroupButton({ slot }: { slot: ToolSlot }) {
  const editor = useEditor();
  const active = useWorkspace((s) => s.activeTool);
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const [face, setFace] = useState<ToolId>(slot.tools[0].id);
  const [open, setOpen] = useState(false);
  const holdTimer = useRef(0);
  /** True when the current press opened the menu (so its click doesn't also select). */
  const openedByHold = useRef(false);

  useEffect(() => {
    if (slot.tools.some((tool) => tool.id === active)) setFace(active);
  }, [active, slot]);
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const current = slot.tools.find((tool) => tool.id === face) ?? slot.tools[0];
  const Icon = current.icon;
  const isActive = slot.tools.some((tool) => tool.id === active);
  const cancelHold = () => window.clearTimeout(holdTimer.current);
  const choose = (id: ToolId) => {
    setFace(id);
    editor?.setTool(id);
    setOpen(false);
  };

  return (
    <>
      <IconButton
        ref={ref}
        label={t(`tool.${toolKey(current.id)}`)}
        shortcut={current.shortcut || undefined}
        tooltipSide="right"
        active={isActive}
        className="sw-icon-btn--group"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tool={current.id}
        data-tool-group={slot.id}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          openedByHold.current = false;
          cancelHold();
          holdTimer.current = window.setTimeout(() => {
            openedByHold.current = true;
            setOpen(true);
          }, HOLD_DELAY);
        }}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onClick={() => {
          if (openedByHold.current) {
            openedByHold.current = false;
            return;
          }
          choose(current.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelHold();
          setOpen(true);
        }}
      >
        <Icon size={18} strokeWidth={1.75} />
        <span className="sw-tool-group-mark" aria-hidden="true" />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="right-start" className="sw-tool-flyout">
        <div role="menu" aria-label={t(`tool.${toolKey(current.id)}`)} data-testid={`tool-flyout-${slot.id}`}>
          {slot.tools.map((tool) => {
            const ItemIcon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                role="menuitemradio"
                aria-checked={tool.id === face}
                className="sw-menu__item sw-tool-flyout__item"
                data-tool={tool.id}
                onClick={() => choose(tool.id)}
              >
                <span className="sw-menu__check">{tool.id === face && <Check size={13} />}</span>
                <ItemIcon size={16} strokeWidth={1.75} />
                <span className="sw-menu__label">{t(`tool.${toolKey(tool.id)}`)}</span>
                {tool.shortcut && <span className="sw-menu__shortcut">{tool.shortcut}</span>}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
