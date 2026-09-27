import { describe, expect, it } from 'vitest';
import { Rect } from 'fabric';
import { averageColor, decodeRuns, encodeRuns, PixelSelection, sameSelection } from '../../src/editor/pixelSelection';
import { combineLayers, combineModeFor, defaultSelectionMode, resolveSelectionMode } from '../../src/editor/selectionModes';
import { snapToPixels } from '../../src/editor/tools/MarqueeTool';
import { autoQuickSelectionSize } from '../../src/editor/tools/QuickSelectionTool';

describe('selection modes', () => {
  it('keys held at the start override the tool mode', () => {
    expect(resolveSelectionMode('new', { shift: false, alt: false })).toBe('new');
    expect(resolveSelectionMode('new', { shift: true, alt: false })).toBe('add');
    expect(resolveSelectionMode('new', { shift: false, alt: true })).toBe('subtract');
    expect(resolveSelectionMode('new', { shift: true, alt: true })).toBe('intersect');
    expect(resolveSelectionMode('subtract', { shift: false, alt: false })).toBe('subtract');
    expect(combineModeFor('new')).toBe('replace');
    expect(combineModeFor('intersect')).toBe('intersect');
    expect(defaultSelectionMode('quickSelection')).toBe('add');
    expect(defaultSelectionMode('lasso')).toBe('new');
  });
  it('combines layer selections', () => {
    const [a, b, c] = [new Rect(), new Rect(), new Rect()];
    expect(combineLayers([a, b], [c], 'new')).toEqual([c]);
    expect(combineLayers([a, b], [b, c], 'add')).toEqual([a, b, c]);
    expect(combineLayers([a, b], [b, c], 'subtract')).toEqual([a]);
    expect(combineLayers([a, b], [b, c], 'intersect')).toEqual([b]);
  });
});

describe('selection masks', () => {
  it('intersects with a shape', () => {
    const s = new PixelSelection();
    s.fit(100, 100);
    s.combine({ type: 'rect', x: 0, y: 0, w: 50, h: 50 }, 'replace');
    s.combine({ type: 'rect', x: 25, y: 25, w: 50, h: 50 }, 'intersect');
    expect(s.bounds()).toEqual({ x: 25, y: 25, width: 25, height: 25 });
    expect(s.pixelCount).toBe(625);
  });
  it('run-length encodes masks for undo, losslessly', () => {
    const m = new Uint8Array(1000);
    m.fill(255, 100, 300);
    m.fill(128, 300, 310);
    m[999] = 7;
    const runs = encodeRuns(m);
    expect(runs.length).toBeLessThan(20);
    expect(decodeRuns(runs, m.length)).toEqual(m);
  });
  it('snapshots and restores a selection', () => {
    const s = new PixelSelection();
    s.fit(64, 64);
    expect(s.encode()).toBeNull();
    s.combine({ type: 'ellipse', cx: 32, cy: 32, rx: 20, ry: 10 }, 'replace');
    const snap = s.encode();
    expect(s.encode()).toBe(snap); // cached until the mask changes
    const count = s.pixelCount;
    s.clear();
    s.restore(snap);
    expect(s.pixelCount).toBe(count);
    expect(sameSelection(snap, s.encode())).toBe(true);
    s.combine({ type: 'rect', x: 0, y: 0, w: 1, h: 1 }, 'add');
    expect(sameSelection(snap, s.encode())).toBe(false);
    s.restore(null);
    expect(s.isEmpty).toBe(true);
  });
});

describe('marquee pixel snapping', () => {
  it('rounds both edges so sizes are exact at any zoom', () => {
    // 10.4 → 20.6 covers pixels 10..20 = 11 px (rounding the width alone gives 10).
    expect(snapToPixels({ x: 10.4, y: 5.6, w: 10.2, h: 4.8 }, false)).toEqual({ x: 10, y: 6, w: 11, h: 4 });
    expect(snapToPixels({ x: 3, y: 3, w: 0.2, h: 0.2 }, false)).toEqual({ x: 3, y: 3, w: 1, h: 1 });
    expect(snapToPixels({ x: 0, y: 0, w: 9.6, h: 12.2 }, true)).toEqual({ x: 0, y: 0, w: 12, h: 12 });
  });
});

describe('quick selection', () => {
  it('averages a small patch for the seed colour', () => {
    const w = 5;
    const rgba = new Uint8ClampedArray(w * w * 4);
    for (let i = 0; i < w * w; i++) rgba.set([i % 2 ? 110 : 90, 0, 0, 255], i * 4);
    const [r, g, , a] = averageColor(rgba, w, w, 2, 2, 2);
    expect(Math.abs(r - 100)).toBeLessThan(2);
    expect(g).toBe(0);
    expect(a).toBe(255);
  });
  it('sizes the brush for the artboard', () => {
    expect(autoQuickSelectionSize(1920, 1080)).toBe(31);
    expect(autoQuickSelectionSize(100, 100)).toBe(8);
    expect(autoQuickSelectionSize(20000, 20000)).toBe(250);
  });
});
