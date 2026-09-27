/**
 * Icons the lucide set doesn't have, drawn in its style (24 × 24 grid,
 * 2 px round strokes) so they sit naturally among the others. The spirals
 * were generated with `spiralPathData` (pathShapes.ts).
 */
import { createLucideIcon } from 'lucide-react';

/** A spiral with an arc — the Arc / Spiral tool. */
export const ArcSpiral = createLucideIcon('ArcSpiral', [
  [
    'path',
    {
      d: 'M14 10C13.8 10.1 13.6 10.1 13.4 9.8C13.2 9.6 13.2 9.3 13.4 8.9C13.6 8.6 14 8.3 14.5 8.2C15 8.1 15.7 8.3 16.2 8.8C16.7 9.2 17 10 17 10.8C17 11.7 16.6 12.6 15.9 13.3C15.1 13.9 14 14.3 12.9 14.2C11.7 14.1 10.5 13.5 9.7 12.5C8.8 11.5 8.4 10 8.6 8.5C8.8 7.1 9.6 5.6 10.9 4.6C12.2 3.6 14 3.1 15.8 3.4C17.6 3.6 19.3 4.7 20.5 6.3',
      key: 's',
    },
  ],
  ['path', { d: 'M3 21C3 16.5 5 13.5 8.5 12', key: 'a' }],
]);

/** A quarter-ellipse arc — Arc mode. */
export const Arc = createLucideIcon('Arc', [['path', { d: 'M4 20C4 11 11 4 20 4', key: 'a' }]]);

/** A spiral — Spiral mode. */
export const SpiralMode = createLucideIcon('SpiralMode', [
  [
    'path',
    {
      d: 'M12 12C12 12.2 11.7 12.4 11.4 12.4C11.1 12.4 10.7 12.2 10.6 11.8C10.4 11.4 10.4 10.8 10.7 10.3C10.9 9.7 11.5 9.3 12.3 9.1C13.1 8.9 14 9.1 14.8 9.7C15.6 10.3 16.2 11.2 16.4 12.4C16.5 13.5 16.2 14.8 15.4 15.9C14.5 16.9 13.2 17.7 11.7 17.8C10.1 18 8.5 17.5 7.1 16.4C5.8 15.3 4.9 13.6 4.7 11.7C4.5 9.8 5.1 7.8 6.5 6.2C7.8 4.6 9.8 3.5 12.1 3.2C14.4 3 16.8 3.7 18.7 5.3',
      key: 's',
    },
  ],
]);

/** Concentric rings with dividers — Polar Grid mode. */
export const PolarGrid = createLucideIcon('PolarGrid', [
  ['circle', { cx: '12', cy: '12', r: '9', key: 'o' }],
  ['circle', { cx: '12', cy: '12', r: '4.5', key: 'i' }],
  ['path', { d: 'M12 3v18M3 12h18', key: 'd' }],
]);
