import { describe, expect, it } from 'vitest';
import {
  bandSide,
  crossedBands,
  nextLevel,
  planFreshness,
  sideBands,
  type PlanBand,
} from '@kansoku/shared/planLevels';

const bands = (...rows: Array<[string, number]>) => rows.map(([label, price]) => ({ label, price }));

describe('bandSide', () => {
  it('reads the labels the analyst writes', () => {
    expect(bandSide('Starter buy')).toBe('buy');
    expect(bandSide('Add 2')).toBe('buy');
    expect(bandSide('Deeper add')).toBe('buy');
    expect(bandSide('Add (black-swan reserve)')).toBe('buy');
    expect(bandSide('Black-swan reserve')).toBe('buy');
    expect(bandSide('Trim')).toBe('sell');
    expect(bandSide('Trim more')).toBe('sell');
    expect(bandSide('Thesis stop')).toBe('stop');
    expect(bandSide('加仓 1')).toBe('buy');
    expect(bandSide('减仓')).toBe('sell');
  });

  it('treats "do not" notes as notes, not levels', () => {
    expect(bandSide('No starter')).toBe('note');
    expect(bandSide('No add')).toBe('note');
    expect(bandSide('Watch, do not add')).toBe('note');
    expect(bandSide('Stop adding')).toBe('note');
    expect(bandSide('Something else')).toBe('note');
  });
});

describe('nextLevel', () => {
  const plan = bands(['Starter buy', 134.74], ['Add', 129.17], ['Trim 1', 150.32], ['Trim 2', 167.03]);

  it('finds the closest add below and the closest trim above the price', () => {
    expect(nextLevel(140, sideBands(plan, 'buy'), 'buy')).toMatchObject({
      label: 'Starter buy',
      price: 134.74,
      reached: false,
    });
    expect(nextLevel(140, sideBands(plan, 'sell'), 'sell')).toMatchObject({
      label: 'Trim 1',
      price: 150.32,
      reached: false,
    });
    expect(nextLevel(140, sideBands(plan, 'buy'), 'buy')?.distance_pct).toBeCloseTo(-3.757, 2);
  });

  it('marks a level reached once the price is through every level on that side', () => {
    expect(nextLevel(120, sideBands(plan, 'buy'), 'buy')).toMatchObject({
      label: 'Add',
      reached: true,
    });
    expect(nextLevel(170, sideBands(plan, 'sell'), 'sell')).toMatchObject({
      label: 'Trim 2',
      reached: true,
    });
  });

  it('returns null when the plan has no level on that side', () => {
    expect(nextLevel(140, [], 'buy')).toBeNull();
  });
});

describe('crossedBands', () => {
  const plan: PlanBand[] = bands(['Add', 100], ['Trim', 120], ['Thesis stop', 90], ['No add', 110]);

  it('reports adds and stops crossed on the way down', () => {
    expect(crossedBands(101, 99.5, plan).map((b) => b.label)).toEqual(['Add']);
    expect(crossedBands(101, 89, plan).map((b) => b.label)).toEqual(['Add', 'Thesis stop']);
  });

  it('reports trims crossed on the way up', () => {
    expect(crossedBands(119, 120, plan).map((b) => b.label)).toEqual(['Trim']);
  });

  it('ignores moves that stay on one side, the wrong direction, and notes', () => {
    expect(crossedBands(99, 98, plan)).toEqual([]);
    expect(crossedBands(99, 101, plan)).toEqual([]);
    expect(crossedBands(121, 119, plan)).toEqual([]);
    expect(crossedBands(111, 109, plan)).toEqual([]);
  });
});

describe('planFreshness', () => {
  const now = Date.parse('2026-10-03T14:00:00Z');

  it('is stale once the earnings recorded with the plan have happened', () => {
    expect(planFreshness('2026-10-01T12:00:00Z', '2026-10-02', '2026-10-03', now)).toEqual({
      state: 'stale',
      reason: 'earnings',
      date: '2026-10-02',
    });
  });

  it('warns when earnings are close', () => {
    expect(planFreshness('2026-10-01T12:00:00Z', '2026-10-10', '2026-10-03', now)).toEqual({
      state: 'earnings_soon',
      date: '2026-10-10',
      days: 7,
    });
  });

  it('is stale after 30 days without earnings', () => {
    expect(planFreshness('2026-08-20T12:00:00Z', null, '2026-10-03', now)).toEqual({
      state: 'stale',
      reason: 'age',
      days: 44,
    });
  });

  it('is fresh otherwise', () => {
    expect(planFreshness('2026-10-01T12:00:00Z', '2026-11-05', '2026-10-03', now)).toEqual({
      state: 'fresh',
    });
  });
});

describe('review fixes', () => {
  it('reads curly apostrophes and other "do not" wording as notes', () => {
    for (const label of ['Don’t add', 'Dont add', 'Hold, no add', 'Avoid adding', 'Never add here', 'Not a buy yet', '别加仓', '勿加仓', '暂停加仓', '不减仓']) {
      expect(bandSide(label), label).toBe('note');
    }
  });

  it('knows more stop and buy words', () => {
    expect(bandSide('Cut loss')).toBe('stop');
    expect(bandSide('Invalidation')).toBe('stop');
    expect(bandSide('破位')).toBe('stop');
    expect(bandSide('补仓')).toBe('buy');
    expect(bandSide('增持')).toBe('buy');
  });

  it('prefers the side the analyst set over the label', () => {
    expect(bandSide('Sell below 80', 'stop')).toBe('stop');
    expect(bandSide('Exit', 'sell')).toBe('sell');
    expect(bandSide('Add', 'bogus')).toBe('buy');
    const crossed = crossedBands(85, 79, [{ label: 'Sell below 80', price: 80, side: 'stop' }]);
    expect(crossed.map((b) => b.label)).toEqual(['Sell below 80']);
  });

  it('counts leaving a level the last price sat exactly on', () => {
    const plan = bands(['Thesis stop', 120], ['Trim', 150]);
    expect(crossedBands(120, 119.5, plan).map((b) => b.label)).toEqual(['Thesis stop']);
    expect(crossedBands(150, 150.5, plan).map((b) => b.label)).toEqual(['Trim']);
  });

  it('does not call a plan made after the report stale', () => {
    const now = Date.parse('2026-11-21T14:00:00Z');
    expect(planFreshness('2026-11-20T15:00:00Z', '2026-11-19', '2026-11-21', now)).toEqual({ state: 'fresh' });
    expect(planFreshness('2026-11-19T23:00:00Z', '2026-11-19', '2026-11-21', now)).toEqual({
      state: 'stale',
      reason: 'earnings_day',
      date: '2026-11-19',
    });
  });
});
