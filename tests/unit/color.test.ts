import { describe, expect, it } from 'vitest';
import { formatColor, hsvToRgb, parseColor, rgbToHsv, toHex } from '../../src/ui/controls/color';

describe('colour utilities', () => {
  it('parses hex and rgba', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#1f1f24')).toEqual({ r: 31, g: 31, b: 36, a: 1 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('E5484D')).toEqual({ r: 229, g: 72, b: 77, a: 1 });
    expect(parseColor('nope')).toBeNull();
    expect(parseColor(null)).toBeNull();
  });
  it('formats opaque colours as hex and translucent as rgba', () => {
    expect(formatColor({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000');
    expect(formatColor({ r: 255, g: 0, b: 0, a: 0.25 })).toBe('rgba(255, 0, 0, 0.25)');
    expect(toHex({ r: 18, g: 165, b: 148, a: 1 })).toBe('12A594');
  });
  it('round-trips through HSV', () => {
    for (const hex of ['#e5484d', '#12a594', '#3e63dd', '#000000', '#ffffff', '#808080']) {
      const rgb = parseColor(hex)!;
      expect(formatColor(hsvToRgb(rgbToHsv(rgb)))).toBe(hex);
    }
  });
});
