/** Toolbar definitions: icon, label key and shortcut for every tool. */
import {
  Bandage,
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
  shortcut: string;
}

/** Grouped as they appear in the toolbar. */
export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'select', icon: MousePointer2, shortcut: 'V' },
    { id: 'direct', icon: MousePointer, shortcut: 'A' },
  ],
  [
    { id: 'brush', icon: Brush, shortcut: 'B' },
    { id: 'eraser', icon: Eraser, shortcut: 'E' },
    { id: 'spotHealingBrush', icon: Bandage, shortcut: 'J' },
    { id: 'healingBrush', icon: Syringe, shortcut: 'Shift+J' },
    { id: 'pen', icon: PenTool, shortcut: 'P' },
    { id: 'text', icon: Type, shortcut: 'T' },
  ],
  [
    { id: 'rect', icon: Square, shortcut: 'M' },
    { id: 'ellipse', icon: Circle, shortcut: 'L' },
    { id: 'line', icon: Slash, shortcut: '\\' },
    { id: 'polygon', icon: Hexagon, shortcut: 'U' },
  ],
  [
    { id: 'crop', icon: Crop, shortcut: 'C' },
    { id: 'perspectiveCrop', icon: Proportions, shortcut: 'Shift+C' },
  ],
  [
    { id: 'hand', icon: Hand, shortcut: 'H' },
    { id: 'zoom', icon: ZoomIn, shortcut: 'Z' },
    { id: 'eyedropper', icon: Pipette, shortcut: 'I' },
    { id: 'colorSampler', icon: Target, shortcut: 'O' },
    { id: 'ruler', icon: Ruler, shortcut: 'R' },
    { id: 'count', icon: ListOrdered, shortcut: 'N' },
  ],
];

export const ALL_TOOLS = TOOL_GROUPS.flat();
