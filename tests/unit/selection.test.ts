import { describe, expect, it } from 'vitest';
import { Rect } from 'fabric';
import {
  floodFill,
  MAX_MASK_PIXELS,
  PixelSelection,
  rasterizeEllipse,
  rasterizePolygon,
  rasterizeRect,
  traceContours,
} from '../../src/editor/pixelSelection';
import { computeEdges, liveWire, snapToEdge } from '../../src/editor/edgeTrace';
import {
  artboardAt,
  artboardsToDocument,
  listArtboards,
  nextArtboardName,
  owningArtboard,
  rectFromPoints,
} from '../../src/editor/artboards';
import { boxCoverage } from '../../src/editor/tools/ObjectSelectionTool';
import { colorDistance, layerColor, similarLayers } from '../../src/editor/tools/MagicWandTool';
import { resized } from '../../src/editor/tools/ArtboardTool';
import { polygonArea } from '../../src/editor/tools/LassoTool';

const sum = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);

describe('pixel selection rasterizers', () => {
  it('fills whole pixels for a rectangle', () => {
    const m = rasterizeRect(10, 10, 2, 3, 4, 2);
    expect(sum(m)).toBe(8);
    expect(m[3 * 10 + 2]).toBe(1);
    expect(m[3 * 10 + 6]).toBe(0);
    expect(m[5 * 10 + 2]).toBe(0);
  });
  it('clips shapes to the artboard', () => {
    expect(sum(rasterizeRect(10, 10, -5, -5, 8, 8))).toBe(9);
  });
  it('approximates an ellipse area', () => {
    const m = rasterizeEllipse(200, 200, 100, 100, 80, 40);
    expect(Math.abs(sum(m) - Math.PI * 80 * 40) / (Math.PI * 80 * 40)).toBeLessThan(0.01);
  });
  it('fills a self-crossing lasso solidly (non-zero winding)', () => {
    const square = rasterizePolygon(20, 20, [
      { x: 2, y: 2 },
      { x: 12, y: 2 },
      { x: 12, y: 12 },
      { x: 2, y: 12 },
    ]);
    expect(sum(square)).toBe(100);
    const triangle = rasterizePolygon(100, 100, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ]);
    expect(Math.abs(sum(triangle) - 5000)).toBeLessThan(100);
  });
});

describe('PixelSelection', () => {
  it('replaces, adds, subtracts and inverts', () => {
    const s = new PixelSelection();
    s.fit(100, 50);
    expect(s.isEmpty).toBe(true);
    s.combine({ type: 'rect', x: 10, y: 10, w: 20, h: 10 }, 'replace');
    expect(s.pixelCount).toBe(200);
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 20, height: 10 });
    s.combine({ type: 'rect', x: 50, y: 10, w: 10, h: 10 }, 'add');
    expect(s.pixelCount).toBe(300);
    expect(s.bounds()).toEqual({ x: 10, y: 10, width: 50, height: 10 });
    s.combine({ type: 'rect', x: 0, y: 0, w: 20, h: 50 }, 'subtract');
    expect(s.pixelCount).toBe(200);
    expect(s.contains(15, 15)).toBe(false);
    expect(s.contains(25, 15)).toBe(true);
    s.combine({ type: 'rect', x: 0, y: 0, w: 5, h: 5 }, 'replace');
    expect(s.pixelCount).toBe(25);
    s.invert();
    expect(s.pixelCount).toBe(100 * 50 - 25);
    s.clear();
    expect(s.isEmpty).toBe(true);
    expect(s.bounds()).toBeNull();
  });
  it('clears when the artboard size changes', () => {
    const s = new PixelSelection();
    s.fit(100, 100);
    s.combine({ type: 'rect', x: 0, y: 0, w: 10, h: 10 }, 'replace');
    s.fit(100, 100);
    expect(s.isEmpty).toBe(false);
    s.fit(200, 100);
    expect(s.isEmpty).toBe(true);
    expect(s.width).toBe(200);
  });
  it('stores huge artboards at reduced resolution', () => {
    const s = new PixelSelection();
    s.fit(10000, 10000);
    expect(s.width * s.height).toBeLessThanOrEqual(MAX_MASK_PIXELS + 10000);
    s.combine({ type: 'rect', x: 1000, y: 1000, w: 2000, h: 1000 }, 'replace');
    const b = s.bounds()!;
    expect(Math.abs(b.x - 1000)).toBeLessThan(3);
    expect(Math.abs(b.width - 2000)).toBeLessThan(5);
  });
  it('selects a single pixel row across the artboard', () => {
    const s = new PixelSelection();
    s.fit(300, 200);
    s.combine({ type: 'rect', x: 0, y: 42, w: 300, h: 1 }, 'replace');
    expect(s.pixelCount).toBe(300);
    expect(s.bounds()).toEqual({ x: 0, y: 42, width: 300, height: 1 });
  });
});

describe('contour tracing', () => {
  it('traces a rectangle as one loop of 4 corners', () => {
    const m = rasterizeRect(10, 10, 2, 2, 3, 4);
    const loops = traceContours(m, 10, 10);
    expect(loops).toHaveLength(1);
    expect(Array.from(loops[0])).toEqual([2, 2, 5, 2, 5, 6, 2, 6]);
  });
  it('gives islands and holes their own loops', () => {
    const donut = rasterizeRect(20, 20, 0, 0, 10, 10);
    const hole = rasterizeRect(20, 20, 3, 3, 3, 3);
    for (let i = 0; i < donut.length; i++) if (hole[i]) donut[i] = 0;
    const island = rasterizeRect(20, 20, 14, 14, 2, 2);
    for (let i = 0; i < donut.length; i++) donut[i] |= island[i];
    expect(traceContours(donut, 20, 20)).toHaveLength(3);
  });
  it('handles pixels touching only diagonally', () => {
    const m = new Uint8Array(4);
    m[0] = 1;
    m[3] = 1;
    const loops = traceContours(m, 2, 2);
    const vertices = loops.reduce((n, l) => n + l.length / 2, 0);
    expect(vertices).toBe(8);
  });
});

describe('flood fill', () => {
  it('stops at colour edges and respects tolerance', () => {
    const w = 10;
    const h = 1;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w; i++) {
      const v = i < 4 ? 100 : i < 7 ? 120 : 200;
      px.set([v, v, v, 255], i * 4);
    }
    const a = new Uint8Array(w);
    floodFill(px, w, h, 0, 0, 10, a);
    expect(sum(a)).toBe(4);
    const b = new Uint8Array(w);
    floodFill(px, w, h, 0, 0, 32, b);
    expect(sum(b)).toBe(7);
  });
});

describe('magnetic lasso edge tracing', () => {
  // 60×60 image: dark square 20..40 on white.
  const w = 60;
  const h = 60;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = x >= 20 && x < 40 && y >= 20 && y < 40 ? 20 : 240;
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
  const edges = computeEdges(px, w, h);

  it('snaps to the nearest strong edge', () => {
    const p = snapToEdge(edges, 25, 15, 10);
    expect(Math.abs(p.y - 20)).toBeLessThanOrEqual(1.5);
    // Nothing nearby: stays put.
    expect(snapToEdge(edges, 5, 5, 3)).toEqual({ x: 5.5, y: 5.5 });
  });
  it('follows the edge instead of cutting across', () => {
    // From the top edge to the right edge of the square: the path should
    // run along the corner, not diagonally through the inside.
    const path = liveWire(edges, { x: 25, y: 20 }, { x: 40, y: 35 });
    expect(path[0]).toEqual({ x: 25.5, y: 20.5 });
    expect(path[path.length - 1]).toEqual({ x: 40.5, y: 35.5 });
    const onEdge = path.filter((p) => edges.strength[Math.floor(p.y) * w + Math.floor(p.x)] > 0.3).length;
    expect(onEdge / path.length).toBeGreaterThan(0.8);
  });
});

describe('artboards', () => {
  const doc = { name: 'Poster', width: 100, height: 50, background: '#fff' };
  it('lists the main artboard first and round-trips extras', () => {
    const list = listArtboards(doc);
    expect(list).toEqual([{ id: 'main', name: 'Poster', x: 0, y: 0, width: 100, height: 50 }]);
    const next = artboardsToDocument(doc, [...list, { id: 'a', name: 'Artboard 2', x: 150, y: 0, width: 40, height: 40 }]);
    expect(next.artboards).toEqual([{ id: 'a', name: 'Artboard 2', x: 150, y: 0, width: 40, height: 40 }]);
    expect(listArtboards(next)).toHaveLength(2);
    expect('artboards' in artboardsToDocument(next, listArtboards(next).slice(0, 1))).toBe(false);
  });
  it('names new artboards "Artboard N" without duplicates', () => {
    const list = listArtboards(doc);
    expect(nextArtboardName(list)).toBe('Artboard 2');
    expect(nextArtboardName([...list, { id: 'x', name: 'Artboard 3', x: 0, y: 0, width: 1, height: 1 }])).toBe('Artboard 4');
  });
  it('finds which artboard owns a layer by its centre', () => {
    const list = [...listArtboards(doc), { id: 'b', name: 'B', x: 200, y: 0, width: 100, height: 100 }];
    expect(artboardAt(list, 250, 50)?.id).toBe('b');
    expect(artboardAt(list, 150, 20)).toBeNull();
    expect(owningArtboard(list, { left: 80, top: 10, width: 60, height: 10 })).toBeNull(); // centre at 110
    expect(owningArtboard(list, { left: 60, top: 10, width: 60, height: 10 })?.id).toBe('main'); // centre at 90
  });
  it('normalizes drag rectangles and resizes by handles', () => {
    expect(rectFromPoints({ x: 10.4, y: 20 }, { x: 2, y: 5.6 })).toEqual({ x: 2, y: 6, width: 8, height: 14 });
    const a = { id: 'a', name: 'A', x: 0, y: 0, width: 100, height: 100 };
    expect(resized(a, 'e', 20, 99)).toMatchObject({ x: 0, width: 120, height: 100 });
    expect(resized(a, 'nw', 10, 10)).toMatchObject({ x: 10, y: 10, width: 90, height: 90 });
    expect(resized(a, 'w', 500, 0)).toMatchObject({ width: 1 });
  });
});

describe('object selection helpers', () => {
  it('measures how much of a layer a box covers', () => {
    const obj = { left: 0, top: 0, width: 100, height: 100 };
    expect(boxCoverage(obj, { left: -10, top: -10, width: 200, height: 200 })).toBe(1);
    expect(boxCoverage(obj, { left: 50, top: 0, width: 100, height: 100 })).toBe(0.5);
    expect(boxCoverage(obj, { left: 200, top: 0, width: 10, height: 10 })).toBe(0);
    // A zero-height line still counts.
    expect(boxCoverage({ left: 0, top: 10, width: 100, height: 0 }, { left: 0, top: 0, width: 60, height: 20 })).toBeCloseTo(0.6);
  });
  it('computes lasso polygon area', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(100);
  });
});

describe('magic wand', () => {
  const rect = (fill: string | null, left: number, top: number, stroke: string | null = null) => {
    const r = new Rect({ left, top, width: 10, height: 10, fill, stroke, originX: 'left', originY: 'top', strokeWidth: 0 });
    r.samaKind = 'rect';
    r.setCoords();
    return r;
  };
  it('reads a layer colour from its fill, falling back to the stroke', () => {
    expect(layerColor(rect('#ff0000', 0, 0))).toEqual([255, 0, 0]);
    expect(layerColor(rect(null, 0, 0, '#00ff00'))).toEqual([0, 255, 0]);
    expect(layerColor(rect('transparent', 0, 0))).toBeNull();
    expect(colorDistance([10, 20, 30], [15, 5, 30])).toBe(15);
  });
  it('selects similar colours, contiguous or not', () => {
    const a = rect('#ff0000', 0, 0);
    const b = rect('#f81010', 10, 0); // touches a (shared edge), close colour
    const c = rect('#ff0000', 100, 0); // far away, same colour
    const d = rect('#0000ff', 20, 0); // touches b, different colour
    const layers = [a, b, c, d];
    expect(similarLayers(layers, a, 32, true)).toEqual([a, b]);
    expect(similarLayers(layers, a, 32, false)).toEqual([a, b, c]);
    expect(similarLayers(layers, a, 0, false)).toEqual([a, c]);
    expect(similarLayers(layers, d, 32, true)).toEqual([d]);
  });
});

describe('selection refinement (soft 0–255 mask)', () => {
  const rectSel = (w = 100, h = 100, r = { x: 30, y: 30, w: 40, h: 20 }) => {
    const s = new PixelSelection();
    s.fit(w, h);
    s.combine({ type: 'rect', ...r }, 'replace');
    return s;
  };
  it('stores 255 for selected pixels; subtract/invert keep soft values consistent', () => {
    const s = rectSel();
    expect(s.getMask()[40 * 100 + 40]).toBe(255);
    s.feather(4);
    const soft = s.getMask();
    s.invert();
    const inv = s.getMask();
    for (let i = 0; i < soft.length; i++) expect(soft[i] + inv[i]).toBe(255);
  });
  it('expands and contracts by exact distances, rounding convex corners', () => {
    const s = rectSel();
    s.expand(5);
    expect(s.bounds()).toEqual({ x: 25, y: 25, width: 50, height: 30 });
    expect(s.contains(25.5, 25.5)).toBe(false); // corner is rounded
    expect(s.contains(50, 25.5)).toBe(true);
    s.contract(5);
    expect(s.bounds()).toEqual({ x: 30, y: 30, width: 40, height: 20 });
    s.contract(20); // thinner than 2×20: gone
    expect(s.isEmpty).toBe(true);
  });
  it('does not contract from the artboard border', () => {
    const s = rectSel(100, 100, { x: 0, y: 0, w: 50, h: 100 });
    s.contract(5);
    expect(s.bounds()).toEqual({ x: 0, y: 0, width: 45, height: 100 });
  });
  it('smooth fills small notches and removes specks', () => {
    const s = rectSel();
    s.combine({ type: 'rect', x: 45, y: 30, w: 1, h: 2 }, 'subtract');
    s.combine({ type: 'rect', x: 90, y: 90, w: 2, h: 2 }, 'add');
    s.smooth(2);
    expect(s.contains(45.5, 30.5)).toBe(true);
    expect(s.contains(90.5, 90.5)).toBe(false);
    expect(s.bounds()).toEqual({ x: 30, y: 30, width: 40, height: 20 });
  });
  it('feather softens the edge symmetrically and keeps the 50 % outline in place', () => {
    const s = rectSel();
    const before = s.pixelCount;
    s.feather(4);
    const m = s.getMask();
    const row = 40 * 100;
    expect(m[row + 25]).toBeLessThan(40); // outside, near the edge
    expect(m[row + 29]).toBeGreaterThan(40);
    expect(m[row + 29]).toBeLessThan(255);
    expect(m[row + 50]).toBe(255); // deep inside
    expect(Math.abs(s.pixelCount - before)).toBeLessThan(before * 0.08);
    const b = s.bounds()!;
    expect(b.x).toBeLessThan(30); // soft pixels reach beyond the old edge
  });
  it('quick-select style add/subtract with a 0–255 mask', () => {
    const s = rectSel();
    const add = new Uint8Array(100 * 100);
    add[5 * 100 + 5] = 255;
    s.combineMask(add, 'add');
    expect(s.contains(5.5, 5.5)).toBe(true);
    s.combineMask(add, 'subtract');
    expect(s.contains(5.5, 5.5)).toBe(false);
    expect(s.contains(40, 40)).toBe(true);
  });
});
