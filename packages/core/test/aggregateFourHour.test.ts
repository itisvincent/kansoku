import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import { aggregateFourHour } from '../src/charts/aggregateFourHour.js';

function hourBar(time: string, close: number): RawBar {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 100 };
}

describe('aggregateFourHour', () => {
  it('groups US hourly bars by the New York clock, not every four bars', () => {
    // A regular session in summer: 09:30 .. 15:30 New York = 13:30 .. 19:30 UTC.
    const day = ['13:30', '14:30', '15:30', '16:30', '17:30', '18:30', '19:30'].map((t, i) =>
      hourBar(`2026-06-02T${t}:00.000Z`, 100 + i),
    );
    const bars = aggregateFourHour(day, 'US');
    expect(bars.map((b) => b.time)).toEqual([
      '2026-06-02T13:30:00.000Z', // 08:00-12:00 block: 09:30, 10:30, 11:30
      '2026-06-02T16:30:00.000Z', // 12:00-16:00 block: 12:30 .. 15:30
    ]);
    expect(bars[0].volume).toBe(300);
    expect(bars[1].volume).toBe(400);
  });

  it('keeps candles on the same hours when a source bar is missing', () => {
    const day = ['13:30', '15:30', '16:30', '17:30', '18:30', '19:30'].map((t, i) =>
      hourBar(`2026-06-02T${t}:00.000Z`, 100 + i),
    );
    const bars = aggregateFourHour(day, 'US');
    expect(bars.map((b) => b.time)).toEqual([
      '2026-06-02T13:30:00.000Z',
      '2026-06-02T16:30:00.000Z',
    ]);
  });

  it('never joins bars from different days', () => {
    const bars = aggregateFourHour(
      [hourBar('2026-06-02T19:30:00.000Z', 1), hourBar('2026-06-03T13:30:00.000Z', 2)],
      'US',
    );
    expect(bars).toHaveLength(2);
  });
});
