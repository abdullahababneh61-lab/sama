/**
 * The lens-flare graphic made by the Flare tool (in the spirit of
 * Illustrator's): a bright core inside a soft glow ("halo"), thin rays and a
 * long horizontal streak through the centre, and a few smaller rings trailing
 * away from the centre along a chosen direction.
 *
 * It is one group of ordinary shapes filled with radial gradients, so it
 * selects, moves, resizes and rotates like any group and survives export
 * and undo. Colours and proportions are fixed for now (warm white/yellow
 * fading to transparent).
 */
import { Ellipse, Gradient, Group, Path, type FabricObject } from 'fabric';
import type { XY } from './pathShapes';

type RGB = [number, number, number];
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

/** A radial gradient filling its object's box: stops as [offset, colour, alpha]. */
const glow = (stops: [number, RGB, number][]) =>
  new Gradient({
    type: 'radial',
    gradientUnits: 'percentage',
    coords: { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.5 },
    colorStops: stops.map(([offset, c, a]) => ({ offset, color: rgba(c, a) })),
  });

const WHITE: RGB = [255, 255, 255];
const WARM: RGB = [255, 244, 214];
const GOLD: RGB = [255, 206, 112];

/** Rays: relative lengths going round the centre (0° and 90° are the longest, so the rays sit centred in their box). */
const RAY_LENGTHS = [1, 0.45, 0.7, 0.35, 1, 0.4, 0.65, 0.3, 1, 0.5, 0.72, 0.32, 1, 0.42, 0.6, 0.28];

/** The trailing rings: position along the ring line (0 = centre, 1 = end), size (× radius), tint, strength. */
const RINGS: { t: number; size: number; tint: RGB; alpha: number; rim?: boolean }[] = [
  { t: 0.3, size: 0.14, tint: [255, 235, 190], alpha: 0.65 },
  { t: 0.48, size: 0.08, tint: [190, 225, 255], alpha: 0.75 },
  { t: 0.63, size: 0.26, tint: [255, 210, 160], alpha: 0.4 },
  { t: 0.8, size: 0.11, tint: [205, 255, 225], alpha: 0.65 },
  { t: 1, size: 0.4, tint: WHITE, alpha: 0.26, rim: true },
];

const disc = (c: XY, rx: number, ry: number, fill: Gradient<'radial'>, name: string) => {
  const e = new Ellipse({ left: c.x, top: c.y, rx, ry, originX: 'center', originY: 'center', fill, strokeWidth: 0 });
  e.samaKind = 'ellipse';
  e.samaName = name;
  return e;
};

/** Where the rings end when none was chosen: down-right, three radii away. */
export function defaultRingsVector(radius: number): XY {
  return { x: radius * 2.1, y: radius * 2.1 };
}

/**
 * The flare's parts, centred on `center`: `radius` is the glow's radius and
 * `rings` the vector from the centre to the last ring.
 */
export function flareParts(center: XY, radius: number, rings: XY): FabricObject[] {
  const R = Math.max(2, radius);
  const parts: FabricObject[] = [];
  parts.push(
    disc(center, R, R, glow([[0, WARM, 0.9], [0.2, [255, 236, 170], 0.55], [0.5, GOLD, 0.2], [1, GOLD, 0]]), 'Halo'),
  );
  // Rays: thin wedges from the centre, fading outwards.
  const L = R * 1.6;
  const w = Math.max(0.6, R * 0.025);
  const d = RAY_LENGTHS.map((len, k) => {
    const a = (k * 2 * Math.PI) / RAY_LENGTHS.length;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const tip = { x: center.x + ux * L * len, y: center.y + uy * L * len };
    return `M ${center.x - uy * w} ${center.y + ux * w} L ${tip.x} ${tip.y} L ${center.x + uy * w} ${center.y - ux * w} Z`;
  }).join(' ');
  const rays = new Path(d, { fill: glow([[0, WHITE, 0.85], [0.35, WARM, 0.35], [1, WARM, 0]]), strokeWidth: 0 });
  rays.samaKind = 'path';
  rays.samaName = 'Rays';
  parts.push(rays);
  parts.push(disc(center, R * 2.6, Math.max(1, R * 0.045), glow([[0, WHITE, 0.9], [0.3, WARM, 0.35], [1, WARM, 0]]), 'Streak'));
  parts.push(disc(center, R * 0.22, R * 0.22, glow([[0, WHITE, 1], [0.6, [255, 255, 245], 0.9], [1, WARM, 0]]), 'Core'));
  RINGS.forEach((ring, i) => {
    const c = { x: center.x + rings.x * ring.t, y: center.y + rings.y * ring.t };
    const r = R * ring.size;
    const e = disc(c, r, r, glow([[0, ring.tint, ring.alpha * 0.35], [0.78, ring.tint, ring.alpha], [1, ring.tint, 0]]), `Ring ${i + 1}`);
    if (ring.rim) e.set({ stroke: rgba(WHITE, 0.35), strokeWidth: Math.max(0.75, R * 0.012), strokeUniform: true });
    parts.push(e);
  });
  return parts;
}

/** The flare as one group layer. */
export function createFlare(center: XY, radius: number, rings: XY): Group {
  const group = new Group(flareParts(center, radius, rings));
  group.samaKind = 'group';
  group.samaName = 'Flare';
  group.samaParams = { type: 'flare', radius, ringsX: rings.x, ringsY: rings.y };
  group.setCoords();
  return group;
}
