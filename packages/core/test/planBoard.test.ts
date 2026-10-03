import { describe, expect, it, vi } from 'vitest';
import type { ChartDoc, ChartMeta, PortfolioPositionRow } from '@kansoku/shared/types';
import {
  buildPlanBoard,
  createSavedPlanFinder,
  type SavedPlan,
} from '../src/plans/planBoard.js';

const NOW = Date.parse('2026-10-03T14:00:00Z');

function position(symbol: string, last = 100): PortfolioPositionRow {
  return {
    symbol,
    name: symbol,
    quantity: 10,
    cost_price: 90,
    last,
    market_value: last * 10,
    pnl: 0,
    pnl_pct: 0,
  };
}

function saved(chartId: string, extra: Partial<SavedPlan> = {}): SavedPlan {
  return {
    chart_id: chartId,
    made_at: '2026-10-02T12:00:00Z',
    plan: {
      anchor_year: 'FY2027',
      scenarios: [
        { kind: 'bear', eps: 10, pe: 15, target: 150 },
        { kind: 'base', eps: 10.5, pe: 20, target: 210 },
        { kind: 'bull', eps: 11, pe: 25, target: 275 },
      ],
      bands: [
        { label: 'Add', price: 90 },
        { label: 'Trim', price: 120 },
      ],
    },
    next_earnings: '2026-10-28',
    ...extra,
  };
}

describe('buildPlanBoard', () => {
  it('pairs each holding with its newest plan and judges freshness', async () => {
    const board = await buildPlanBoard({
      listPositions: async () => [position('NVDA.US', 105), position('5.HK', 150)],
      findPlan: async (symbol) => (symbol === 'NVDA.US' ? saved('nvda-1') : null),
      now: () => NOW,
    });
    expect(board.generated_at).toBe('2026-10-03T14:00:00.000Z');
    const [nvda, hsbc] = board.rows;
    expect(nvda).toMatchObject({ symbol: 'NVDA.US', price: 105, quantity: 10 });
    expect(nvda.plan).toMatchObject({
      chart_id: 'nvda-1',
      anchor_year: 'FY2027',
      targets: { bear: 150, base: 210, bull: 275 },
      next_earnings: '2026-10-28',
      freshness: { state: 'fresh' },
    });
    expect(nvda.plan?.bands.map((b) => b.label)).toEqual(['Add', 'Trim']);
    expect(hsbc).toMatchObject({ symbol: '5.HK', plan: null });
  });

  it('flags a plan made before the earnings it was waiting for', async () => {
    const board = await buildPlanBoard({
      listPositions: async () => [position('IBM.US')],
      findPlan: async () =>
        saved('ibm-1', { made_at: '2026-09-28T12:00:00Z', next_earnings: '2026-10-01' }),
      now: () => NOW,
    });
    expect(board.rows[0].plan?.freshness).toEqual({
      state: 'stale',
      reason: 'earnings',
      date: '2026-10-01',
    });
  });

  it('keeps a holding on the board when its plan cannot be read', async () => {
    const board = await buildPlanBoard({
      listPositions: async () => [position('AAPL.US')],
      findPlan: async () => {
        throw new Error('disk error');
      },
      now: () => NOW,
    });
    expect(board.rows).toEqual([expect.objectContaining({ symbol: 'AAPL.US', plan: null })]);
  });
});

describe('createSavedPlanFinder', () => {
  const meta = (id: string, created: string) =>
    ({ id, created_at: created, symbol: 'NVDA.US', type: 'intraday' }) as ChartMeta;
  const doc = (plan: unknown, extra: Record<string, unknown> = {}) =>
    ({
      input: { prediction: plan ? { eps_pe_plan: plan, made_at: '2026-10-02T12:00:00Z' } : {}, ...extra },
    }) as unknown as ChartDoc;

  it('returns the newest chart that carries a plan, with its recorded earnings date', async () => {
    const plan = { scenarios: [{ kind: 'bear', eps: 1, pe: 10, target: 10 }], bands: [] };
    const loadChart = vi.fn(async (id: string) =>
      id === 'newest-no-plan'
        ? doc(null)
        : doc(plan, { event_risk: { next_earnings: { date: '2026-11-19', title: 'Q3' } } }),
    );
    const find = createSavedPlanFinder({
      listCharts: async () => [meta('newest-no-plan', '2026-10-03'), meta('older-plan', '2026-10-02')],
      loadChart,
    });
    expect(await find('NVDA.US')).toMatchObject({
      chart_id: 'older-plan',
      made_at: '2026-10-02T12:00:00Z',
      next_earnings: '2026-11-19',
    });
  });

  it('reads a chart once and reuses it until a newer chart appears', async () => {
    const plan = { scenarios: [], bands: [{ label: 'Add', price: 1 }] };
    const loadChart = vi.fn(async () => doc(plan));
    let metas = [meta('a', '2026-10-02')];
    const find = createSavedPlanFinder({ listCharts: async () => metas, loadChart });
    await find('NVDA.US');
    await find('NVDA.US');
    expect(loadChart).toHaveBeenCalledTimes(1);
    metas = [meta('b', '2026-10-03'), ...metas];
    expect((await find('NVDA.US'))?.chart_id).toBe('b');
    expect(loadChart).toHaveBeenCalledTimes(2);
  });

  it('returns null when no chart has a plan', async () => {
    const find = createSavedPlanFinder({
      listCharts: async () => [meta('a', '2026-10-02')],
      loadChart: async () => doc(null),
    });
    expect(await find('NVDA.US')).toBeNull();
  });
});

describe('createSavedPlanFinder freshness', () => {
  const plan = (price: number) => ({ scenarios: [], bands: [{ label: 'Add', price }] });
  const metaAt = (id: string, updated: string, prediction?: string) =>
    ({ id, created_at: '2026-10-02', updated_at: updated, prediction_updated_at: prediction, symbol: 'NVDA.US', type: 'intraday' }) as ChartMeta;
  const docWith = (p: unknown) =>
    ({ input: { prediction: p ? { eps_pe_plan: p, made_at: '2026-10-02T12:00:00Z' } : {} } }) as unknown as ChartDoc;

  it('re-reads a chart whose prediction was saved after it was first read', async () => {
    let stored: unknown = null;
    let metas = [metaAt('a', '2026-10-02T12:00:00Z')];
    const loadChart = vi.fn(async () => docWith(stored));
    const find = createSavedPlanFinder({ listCharts: async () => metas, loadChart });
    expect(await find('NVDA.US')).toBeNull();
    stored = plan(200);
    metas = [metaAt('a', '2026-10-02T12:05:00Z', '2026-10-02T12:05:00Z')];
    expect((await find('NVDA.US'))?.plan.bands?.[0].price).toBe(200);
  });

  it('does not remember a chart it could not read', async () => {
    let readable = false;
    const loadChart = vi.fn(async () => (readable ? docWith(plan(150)) : null));
    const find = createSavedPlanFinder({
      listCharts: async () => [metaAt('a', '2026-10-02T12:00:00Z')],
      loadChart,
    });
    expect(await find('NVDA.US')).toBeNull();
    readable = true;
    expect((await find('NVDA.US'))?.plan.bands?.[0].price).toBe(150);
  });
});
