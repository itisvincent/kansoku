import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import { wilderAtr } from '../src/analysis/atr.js';

const bar = (high: number, low: number, close: number): RawBar => ({
  time: '2026-09-01T00:00:00Z',
  open: close,
  high,
  low,
  close,
  volume: 1,
});

describe('wilderAtr', () => {
  it('needs period + 1 bars', () => {
    expect(wilderAtr([bar(2, 1, 1.5)], 14)).toBeNull();
  });

  it('seeds with the mean true range, then smooths with Wilder weights', () => {
    // Four bars → three true ranges: 2, 3 (gap up from 10 to 13 high), 1.
    const bars = [bar(11, 9, 10), bar(12, 10, 11), bar(14, 12, 13), bar(13.5, 12.5, 13)];
    // seed over period 2 = (2 + 3) / 2 = 2.5; next = (2.5 × 1 + 1) / 2 = 1.75
    expect(wilderAtr(bars, 2)).toBeCloseTo(1.75, 10);
  });

  it('counts a gap through the previous close as range', () => {
    const bars = [bar(10, 9, 10), bar(15, 14, 14.5)];
    expect(wilderAtr(bars, 1)).toBe(5);
  });

  it('returns null on non-numeric bars instead of NaN', () => {
    const bad = { ...bar(1, 0, 0.5), high: 'x' } as unknown as RawBar;
    expect(wilderAtr([bar(1, 0, 0.5), bad], 1)).toBeNull();
  });
});
