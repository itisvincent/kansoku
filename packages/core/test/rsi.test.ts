import { describe, expect, it } from 'vitest';
import { rsi } from '../src/analysis/indicators.js';

describe('rsi', () => {
  it('leaves the warm-up bars empty', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const out = rsi(closes, 14);
    expect(out.slice(0, 14)).toEqual(Array.from({ length: 14 }, () => null));
    expect(out[14]).not.toBeNull();
  });

  it('is 100 after a run of only gains', () => {
    const closes = Array.from({ length: 16 }, (_, i) => i + 1);
    const out = rsi(closes, 14);
    expect(out[14]).toBe(100);
    expect(out[15]).toBe(100);
  });

  it('is 0 after a run of only losses', () => {
    const closes = Array.from({ length: 16 }, (_, i) => 20 - i);
    const out = rsi(closes, 14);
    expect(out[14]).toBe(0);
    expect(out[15]).toBe(0);
  });

  it('stays inside 0-100 on mixed closes', () => {
    const closes = [10, 11, 9, 12, 8, 13, 7, 14, 6, 15, 5, 16, 4, 17, 10, 11, 9];
    for (const value of rsi(closes, 14)) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
