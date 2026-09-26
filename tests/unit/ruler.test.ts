import { describe, expect, it } from 'vitest';
import { measure } from '../../src/editor/tools/RulerTool';

describe('ruler measure()', () => {
  it('measures length', () => {
    expect(measure({ x: 0, y: 0 }, { x: 3, y: 4 }).length).toBe(5);
  });
  it('measures angle from horizontal, counter-clockwise positive (screen y is down)', () => {
    expect(measure({ x: 0, y: 0 }, { x: 10, y: 0 }).angle).toBe(0);
    expect(measure({ x: 0, y: 0 }, { x: 10, y: -10 }).angle).toBeCloseTo(45);
    expect(measure({ x: 0, y: 0 }, { x: 0, y: 10 }).angle).toBeCloseTo(-90);
    expect(measure({ x: 0, y: 0 }, { x: -10, y: 0 }).angle).toBeCloseTo(180);
  });
});
