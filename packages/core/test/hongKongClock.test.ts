import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import { sessionVwap } from '../src/analysis/vwap.js';
import { prevDayLevels } from '../src/analysis/dayLevels.js';

function bar(time: string, price: number, volume = 100): RawBar {
  return { time, open: price, high: price, low: price, close: price, volume };
}

describe('Hong Kong charts use the Hong Kong clock', () => {
  // 10:00 and 13:00 Hong Kong on 2 Oct = 22:00 and 01:00 New York, on two New York dates.
  const session = [bar('2026-10-02T02:00:00.000Z', 100), bar('2026-10-02T05:00:00.000Z', 110)];

  it('keeps one VWAP through the Hong Kong session', () => {
    const points = sessionVwap(session, 'HK');
    expect(points.at(-1)?.value).toBeCloseTo(105);
    // On the New York clock the line would restart at the second bar.
    expect(sessionVwap(session, 'US').at(-1)?.value).toBeCloseTo(110);
  });

  it('takes the previous Hong Kong day as the prior day', () => {
    // Hong Kong day bars are stamped at midnight Hong Kong (16:00 UTC the day before).
    const days = [bar('2026-09-30T16:00:00.000Z', 90), bar('2026-10-01T16:00:00.000Z', 95)];
    // 10:00 Hong Kong on 2 Oct: the 1 Oct bar is the prior day; the 2 Oct bar is today.
    const now = new Date('2026-10-02T02:00:00.000Z');
    expect(prevDayLevels(days, now, 'HK')?.close).toBe(90);
  });
});
