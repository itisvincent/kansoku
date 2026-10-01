import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const comments: string[] = [];
let stop = 95;
vi.mock('../src/charts/store.js', () => ({
  listCharts: async () => [{ id: 'c1', created_at: new Date().toISOString() }],
  loadChart: async () => ({
    id: 'c1',
    created_at: new Date().toISOString(),
    built: {
      kind: 'intraday',
      sidebar: { prediction: { direction: 'long' } },
      entryPlan: { entry: 100, stop, target1: 110 },
    },
  }),
}));
vi.mock('../src/realtime/quotes.js', () => ({ onAnyQuoteUpdate: () => () => {} }));
vi.mock('../src/ai/personas/comments.js', () => ({
  appendComment: async (c: { text: string }) => {
    comments.push(c.text);
  },
}));

const { handlePredictionTick, resetPredictionAlertState } = await import(
  '../src/ai/personas/predictionAlerts.js'
);
const tick = (last: number) =>
  handlePredictionTick({ symbol: 'MU.US', last, regularLast: last } as never);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date());
  resetPredictionAlertState();
  comments.length = 0;
  stop = 95;
});
afterEach(() => vi.useRealTimers());

describe('price-level alerts', () => {
  it('fires a crossed level once, not again on every 5-minute plan reload', async () => {
    await tick(96);
    await tick(94); // crosses the stop
    expect(comments).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(Date.now() + 6 * 60_000));
      await tick(96);
      await tick(94); // bounces across the stop again
    }
    expect(comments).toHaveLength(1);
  });

  it('re-arms when the plan is edited to a new level', async () => {
    await tick(96);
    await tick(94);
    expect(comments).toHaveLength(1);
    stop = 92;
    vi.setSystemTime(new Date(Date.now() + 6 * 60_000));
    await tick(93);
    await tick(91); // crosses the new stop
    expect(comments).toHaveLength(2);
  });
});
