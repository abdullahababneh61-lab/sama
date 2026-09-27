/** Toolbar definitions: icon, label key and shortcut for every tool. */
import {
  Bandage,
  CircleDashed,
  File,
  Lasso,
  LassoSelect,
  Magnet,
  MousePointerClick,
  Rows2,
  SquareDashed,
  SquareDashedMousePointer,
  Wand,
  WandSparkles,
  Brush,
  Circle,
  Crop,
  Proportions,
  Eraser,
  Hand,
  Hexagon,
  ListOrdered,
  MousePointer,
  MousePointer2,
  PenTool,
  Ruler,
  Pipette,
  Slash,
  Square,
  Syringe,
  Target,
  Type,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import type { ToolId } from '../editor/types';

export interface ToolDef {
  id: ToolId;
  icon: LucideIcon;
  /** Empty when the tool has no shortcut of its own. */
  shortcut: string;
}

/**
 * One toolbar button. Most hold a single tool; a slot with several tools is
 * a Photoshop-style pop-out group: the button shows the variant used last
 * (the first one to begin with) with a small corner triangle, and holding
 * the button or right-clicking it lists the other variants.
 */
export interface ToolSlot {
  id: string;
  tools: ToolDef[];
}

/**
 * i18n key suffix for a tool's name and hint (`tool.<key>`, `hint.<key>`).
 * The Move/Select tool is presented as "Selection".
 */
export function toolKey(id: ToolId): string {
  return id === 'select' ? 'selection' : id;
}

const single = (def: ToolDef): ToolSlot => ({ id: def.id, tools: [def] });

/**
 * Toolbar layout, in groups separated by dividers. The order follows
 * Photoshop's: selection tools, then Crop, then painting, drawing and
 * viewing tools.
 */
export const TOOL_GROUPS: ToolSlot[][] = [
  [
    single({ id: 'select', icon: MousePointer2, shortcut: 'V' }),
    single({ id: 'direct', icon: MousePointer, shortcut: 'A' }),
    single({ id: 'groupSelection', icon: MousePointerClick, shortcut: 'Shift+V' }),
    single({ id: 'artboard', icon: File, shortcut: 'Shift+O' }),
  ],
  [
    {
      id: 'marquee',
      tools: [
        { id: 'rectMarquee', icon: SquareDashed, shortcut: 'Shift+M' },
        { id: 'ellipseMarquee', icon: CircleDashed, shortcut: 'Shift+M' },
        { id: 'singleRowColumnMarquee', icon: Rows2, shortcut: '' },
      ],
    },
    {
      id: 'lasso',
      tools: [
        { id: 'lasso', icon: Lasso, shortcut: 'Q' },
        { id: 'polygonalLasso', icon: LassoSelect, shortcut: 'Shift+L' },
        { id: 'magneticLasso', icon: Magnet, shortcut: 'Alt+Shift+L' },
      ],
    },
    single({ id: 'objectSelection', icon: SquareDashedMousePointer, shortcut: 'W' }),
    single({ id: 'quickSelection', icon: Wand, shortcut: 'Shift+W' }),
    single({ id: 'magicWand', icon: WandSparkles, shortcut: 'Y' }),
  ],
  [
    single({ id: 'crop', icon: Crop, shortcut: 'C' }),
    single({ id: 'perspectiveCrop', icon: Proportions, shortcut: 'Shift+C' }),
  ],
  [
    single({ id: 'brush', icon: Brush, shortcut: 'B' }),
    single({ id: 'eraser', icon: Eraser, shortcut: 'E' }),
    single({ id: 'spotHealingBrush', icon: Bandage, shortcut: 'J' }),
    single({ id: 'healingBrush', icon: Syringe, shortcut: 'Shift+J' }),
    single({ id: 'pen', icon: PenTool, shortcut: 'P' }),
    single({ id: 'text', icon: Type, shortcut: 'T' }),
  ],
  [
    single({ id: 'rect', icon: Square, shortcut: 'M' }),
    single({ id: 'ellipse', icon: Circle, shortcut: 'L' }),
    single({ id: 'line', icon: Slash, shortcut: '\\' }),
    single({ id: 'polygon', icon: Hexagon, shortcut: 'U' }),
  ],
  [
    single({ id: 'hand', icon: Hand, shortcut: 'H' }),
    single({ id: 'zoom', icon: ZoomIn, shortcut: 'Z' }),
    single({ id: 'eyedropper', icon: Pipette, shortcut: 'I' }),
    single({ id: 'colorSampler', icon: Target, shortcut: 'O' }),
    single({ id: 'ruler', icon: Ruler, shortcut: 'R' }),
    single({ id: 'count', icon: ListOrdered, shortcut: 'N' }),
  ],
];

export const ALL_TOOLS = TOOL_GROUPS.flat().flatMap((slot) => slot.tools);
