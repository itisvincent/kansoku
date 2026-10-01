import { describe, expect, it } from 'vitest';
import type { IntradayTfData } from '@kansoku/shared/types';
import { orderAutoSignals } from './AutoSignalsSection';

const point = (time: number) => ({ time, price: 100, macd_value: 1 });
const pair = (kind: 'top' | 'bottom', a: number, b: number) =>
  ({ kind, a: point(a), b: point(b) }) as never;

describe('orderAutoSignals', () => {
  it('lists the newest signals first and shows a repeated divergence once', () => {
    const tf = {
      autoDivergence: [pair('top', 10, 20), pair('bottom', 30, 40)],
      autoBeichi: [pair('top', 10, 20), pair('top', 50, 60)],
      pattern123: [{ p1: point(1), p2: point(2), p3: point(25), status: 'forming' }],
    } as unknown as IntradayTfData;
    const ordered = orderAutoSignals(tf);
    expect(ordered.map((s) => s.time)).toEqual([60, 40, 25, 20]);
    expect(ordered.filter((s) => s.type === 'pair' && s.pair.b.time === 20)).toHaveLength(1);
  });

  it('returns nothing without data', () => {
    expect(orderAutoSignals(null)).toEqual([]);
  });
});
