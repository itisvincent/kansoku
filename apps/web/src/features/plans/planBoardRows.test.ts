import { describe, expect, it } from 'vitest';
import type { PlanBoardRow } from '@kansoku/shared/types';
import { boardRows, NEAR_LEVEL_PCT } from './planBoardRows';

function row(symbol: string, price: number | null, bands: Array<[string, number]> | null): PlanBoardRow {
  return {
    symbol,
    name: symbol,
    quantity: 1,
    market_value: 1,
    price,
    plan: bands
      ? {
          chart_id: `${symbol}-plan`,
          made_at: '2026-10-02T12:00:00Z',
          anchor_year: 'FY2027',
          targets: { bear: 1, base: 2, bull: 3 },
          bands: bands.map(([label, p]) => ({ label, price: p })),
          next_earnings: null,
          freshness: { state: 'fresh' },
        }
      : null,
  };
}

describe('boardRows', () => {
  it('uses the live price over the snapshot price and finds the next levels', () => {
    const [r] = boardRows([row('INTC.US', 140, [['Add', 129], ['Trim', 150], ['Thesis stop', 120]])], {
      'INTC.US': 131,
    });
    expect(r.price).toBe(131);
    expect(r.nextBuy).toMatchObject({ label: 'Add', price: 129, reached: false });
    expect(r.nextSell).toMatchObject({ label: 'Trim', price: 150 });
    expect(r.stop).toMatchObject({ label: 'Thesis stop', price: 120 });
    expect(r.near).toBe(true);
  });

  it('puts reached levels first, then the closest, and holdings without a plan last', () => {
    const rows = boardRows(
      [
        row('FAR.US', 100, [['Add', 50], ['Trim', 200]]),
        row('NONE.US', 100, null),
        row('CLOSE.US', 100, [['Add', 97], ['Trim', 140]]),
        row('IN.US', 100, [['Add', 105], ['Trim', 140]]),
      ],
      {},
    );
    expect(rows.map((r) => r.symbol)).toEqual(['IN.US', 'CLOSE.US', 'FAR.US', 'NONE.US']);
    expect(rows[0].nextBuy?.reached).toBe(true);
  });

  it('marks a row near a level only within the threshold', () => {
    const [near, far] = boardRows(
      [
        row('A.US', 100, [['Add', 100 - NEAR_LEVEL_PCT + 0.5]]),
        row('B.US', 100, [['Add', 100 - NEAR_LEVEL_PCT - 2]]),
      ],
      {},
    );
    expect(near.near).toBe(true);
    expect(far.near).toBe(false);
  });

  it('keeps a row without any price', () => {
    const [r] = boardRows([row('X.US', null, [['Add', 10]])], {});
    expect(r.price).toBeNull();
    expect(r.nextBuy).toBeNull();
  });
});

describe('boardRows below the thesis stop', () => {
  it('marks the stop broken and sorts the row first', () => {
    const rows = boardRows(
      [
        row('IN.US', 100, [['Add', 105], ['Trim', 140]]),
        row('BROKEN.US', 75, [['Add', 100], ['Add 2', 90], ['Thesis stop', 80]]),
      ],
      {},
    );
    expect(rows[0].symbol).toBe('BROKEN.US');
    expect(rows[0].stopBroken).toBe(true);
    expect(rows[1].stopBroken).toBe(false);
  });
});
