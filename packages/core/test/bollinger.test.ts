import { describe, expect, it } from 'vitest';
import { bollinger } from '../src/analysis/indicators.js';

describe('bollinger', () => {
  it('leaves the warm-up bars empty and centers the first value on SMA', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { mid, upper, lower } = bollinger(closes, 5, 2);
    expect(mid.slice(0, 4)).toEqual([null, null, null, null]);
    expect(mid[4]).toBe(3);
    expect(upper[4]).toBeGreaterThan(3);
    expect(lower[4]).toBeLessThan(3);
    expect((upper[4] as number) - 3).toBeCloseTo(3 - (lower[4] as number));
  });

  it('widens the band when the window is more volatile', () => {
    const calm = bollinger([10, 10, 10, 10, 10], 5, 2);
    const jumpy = bollinger([1, 20, 1, 20, 1], 5, 2);
    expect(calm.upper[4]).toBe(10);
    expect(calm.lower[4]).toBe(10);
    expect((jumpy.upper[4] as number) - (jumpy.lower[4] as number)).toBeGreaterThan(0);
  });
});
