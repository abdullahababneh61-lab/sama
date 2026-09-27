/** Shortcut display helpers and the reference list shown in Help ▸ Keyboard shortcuts. */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** "Mod+Shift+Z" → "⌘⇧Z" on macOS, "Ctrl+Shift+Z" elsewhere. */
export function formatShortcut(s: string) {
  if (isMac) {
    return s
      .replace(/Mod\+/g, '⌘')
      .replace(/Shift\+/g, '⇧')
      .replace(/Alt\+/g, '⌥');
  }
  return s.replace(/Mod\+/g, 'Ctrl+');
}

export interface ShortcutGroup {
  title: string;
  items: { keys: string; label: string }[];
}

/** Keys reference. Labels are i18n keys. */
export const SHORTCUT_REFERENCE: ShortcutGroup[] = [
  {
    title: 'shortcuts.tools',
    items: [
      { keys: 'V', label: 'tool.selection' },
      { keys: 'A', label: 'tool.direct' },
      { keys: 'Shift+V', label: 'tool.groupSelection' },
      { keys: 'Shift+O', label: 'tool.artboard' },
      { keys: 'Shift+M', label: 'shortcuts.cycleMarquee' },
      { keys: 'Q', label: 'tool.lasso' },
      { keys: 'Shift+L', label: 'tool.polygonalLasso' },
      { keys: 'Alt+Shift+L', label: 'tool.magneticLasso' },
      { keys: 'W', label: 'tool.objectSelection' },
      { keys: 'Shift+W', label: 'tool.quickSelection' },
      { keys: 'Y', label: 'tool.magicWand' },
      { keys: 'B', label: 'tool.brush' },
      { keys: 'E', label: 'tool.eraser' },
      { keys: 'P', label: 'tool.pen' },
      { keys: 'T', label: 'tool.text' },
      { keys: 'M', label: 'tool.rect' },
      { keys: 'L', label: 'tool.ellipse' },
      { keys: '\\', label: 'tool.line' },
      { keys: 'U', label: 'shortcuts.cycleShapes' },
      { keys: 'C', label: 'tool.crop' },
      { keys: 'Shift+C', label: 'tool.perspectiveCrop' },
      { keys: 'H', label: 'tool.hand' },
      { keys: 'Space', label: 'shortcuts.tempHand' },
      { keys: 'Z', label: 'tool.zoom' },
      { keys: 'I', label: 'tool.eyedropper' },
      { keys: 'O', label: 'tool.colorSampler' },
      { keys: 'R', label: 'tool.ruler' },
      { keys: 'N', label: 'tool.count' },
      { keys: 'J', label: 'tool.spotHealingBrush' },
      { keys: 'Shift+J', label: 'tool.healingBrush' },
    ],
  },
  {
    title: 'shortcuts.edit',
    items: [
      { keys: 'Mod+Z', label: 'menu.undo' },
      { keys: 'Mod+Shift+Z / Mod+Y', label: 'menu.redo' },
      { keys: 'Mod+C / Mod+X / Mod+V', label: 'shortcuts.clipboard' },
      { keys: 'Mod+J / Mod+D', label: 'menu.duplicate' },
      { keys: 'Mod+J', label: 'shortcuts.copyToNewLayer' },
      { keys: 'Mod+Shift+J', label: 'shortcuts.cutToNewLayer' },
      { keys: 'Alt+Drag', label: 'shortcuts.altDrag' },
      { keys: 'Delete / Backspace', label: 'menu.delete' },
      { keys: 'Mod+A', label: 'menu.selectAll' },
      { keys: 'Esc / Mod+Shift+A', label: 'menu.deselect' },
      { keys: 'Arrows / Shift+Arrows', label: 'shortcuts.nudge' },
      { keys: 'Enter', label: 'shortcuts.enterEdit' },
    ],
  },
  {
    title: 'shortcuts.objects',
    items: [
      { keys: 'Mod+G', label: 'menu.group' },
      { keys: 'Mod+Shift+G', label: 'menu.ungroup' },
      { keys: 'Mod+]  /  Mod+[', label: 'shortcuts.forwardBackward' },
      { keys: 'Mod+Shift+]  /  Mod+Shift+[', label: 'shortcuts.frontBack' },
      { keys: 'Mod+Click', label: 'shortcuts.deepSelect' },
      { keys: 'Shift (drag)', label: 'shortcuts.constrain' },
      { keys: 'Alt (drag)', label: 'shortcuts.fromCenter' },
    ],
  },
  {
    title: 'shortcuts.painting',
    items: [
      { keys: '[  /  ]', label: 'shortcuts.brushSize' },
      { keys: 'Shift (brush)', label: 'shortcuts.straightLine' },
      { keys: 'Enter / Esc', label: 'shortcuts.finishPath' },
      { keys: 'Backspace', label: 'shortcuts.removeAnchor' },
    ],
  },
  {
    title: 'shortcuts.view',
    items: [
      { keys: 'Mod+= / Mod+-', label: 'shortcuts.zoomInOut' },
      { keys: 'Mod+Scroll', label: 'shortcuts.zoomWheel' },
      { keys: 'Scroll / Shift+Scroll', label: 'shortcuts.panWheel' },
      { keys: 'Mod+0', label: 'menu.fit' },
      { keys: 'Mod+1', label: 'menu.actualSize' },
      { keys: 'Mod+2', label: 'menu.zoomSelection' },
      { keys: 'Mod+R', label: 'menu.rulers' },
      { keys: 'Mod+;', label: 'menu.guides' },
    ],
  },
  {
    title: 'shortcuts.file',
    items: [
      { keys: 'Mod+O', label: 'menu.open' },
      { keys: 'Mod+S', label: 'menu.save' },
      { keys: 'Mod+Shift+I', label: 'menu.importImage' },
      { keys: 'Mod+Shift+E', label: 'menu.exportPng' },
      { keys: '?', label: 'menu.shortcuts' },
    ],
  },
];
