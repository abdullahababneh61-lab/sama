import { describe, expect, it } from 'vitest';
import { Point } from 'fabric';
import { resizeBox } from '../../src/editor/tools/CropTool';
import { dragBox } from '../../src/editor/geometry';

describe('dragBox (shared by shape and crop tools)', () => {
  it('builds a box from any drag direction', () => {
    expect(dragBox(new Point(100, 100), new Point(40, 160), false, false)).toEqual({ x: 40, y: 100, w: 60, h: 60 });
  });
  it('Shift makes a square, Alt draws from the centre', () => {
    expect(dragBox(new Point(0, 0), new Point(50, 20), true, false)).toEqual({ x: 0, y: 0, w: 50, h: 50 });
    expect(dragBox(new Point(100, 100), new Point(120, 110), false, true)).toEqual({ x: 80, y: 90, w: 40, h: 20 });
  });
  it('never returns an empty box', () => {
    expect(dragBox(new Point(5, 5), new Point(5, 5), false, false)).toEqual({ x: 5, y: 5, w: 1, h: 1 });
  });
});

describe('crop handle resizing', () => {
  const r = { x: 100, y: 100, w: 200, h: 100 };
  it('moves only the dragged edges', () => {
    expect(resizeBox(r, 'se', 50, 20)).toEqual({ x: 100, y: 100, w: 250, h: 120 });
    expect(resizeBox(r, 'n', 999, -30)).toEqual({ x: 100, y: 70, w: 200, h: 130 });
    expect(resizeBox(r, 'w', 20, 999)).toEqual({ x: 120, y: 100, w: 180, h: 100 });
  });
  it('flips instead of going negative when dragged past the opposite edge', () => {
    expect(resizeBox(r, 'e', -250, 0)).toEqual({ x: 50, y: 100, w: 50, h: 100 });
  });
});
