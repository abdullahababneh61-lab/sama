import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/ui/controls/NumberField';

describe('NumberField evaluate()', () => {
  it('parses plain numbers', () => {
    expect(evaluate('42')).toBe(42);
    expect(evaluate('-3.5')).toBe(-3.5);
    expect(evaluate('.5')).toBe(0.5);
  });
  it('evaluates arithmetic with precedence and parentheses', () => {
    expect(evaluate('100/2+8')).toBe(58);
    expect(evaluate('2*(3+4)')).toBe(14);
    expect(evaluate(' 10 - 2 - 3 ')).toBe(5);
  });
  it('accepts Arabic-Indic digits and comma decimals', () => {
    expect(evaluate('١٢٠')).toBe(120);
    expect(evaluate('1,5')).toBe(1.5);
  });
  it('rejects invalid input', () => {
    expect(evaluate('')).toBeNull();
    expect(evaluate('abc')).toBeNull();
    expect(evaluate('1+')).toBeNull();
    expect(evaluate('alert(1)')).toBeNull();
    expect(evaluate('1/0')).toBeNull();
  });
});
