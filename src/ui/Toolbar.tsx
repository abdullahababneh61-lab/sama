import { ImagePlus } from 'lucide-react';
import { IconButton } from './controls/IconButton';
import { TOOL_GROUPS } from './toolDefs';
import { useEditor, useWorkspace } from '../workspace/context';
import { useT } from '../i18n';

/** Vertical tool strip on the left (right in RTL). */
export function Toolbar({ onImportImage }: { onImportImage: () => void }) {
  const editor = useEditor();
  const active = useWorkspace((s) => s.activeTool);
  const t = useT();
  return (
    <nav className="sw-toolbar" aria-label={t('toolbar.label')}>
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="sw-toolbar__group">
          {group.map((tool) => {
            const Icon = tool.icon;
            return (
              <IconButton
                key={tool.id}
                label={t(`tool.${tool.id}`)}
                shortcut={tool.shortcut}
                tooltipSide="right"
                active={active === tool.id}
                data-tool={tool.id}
                onClick={() => editor?.setTool(tool.id)}
              >
                <Icon size={18} strokeWidth={1.75} />
              </IconButton>
            );
          })}
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
