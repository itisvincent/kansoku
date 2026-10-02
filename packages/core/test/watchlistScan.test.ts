import { describe, expect, it, vi } from 'vitest';
import type { ChartDoc, ScanSetup, WatchlistScanState } from '@kansoku/shared/types';
import {
  rankSetups,
  rewardRisk,
  scoreSetup,
  setupFromDoc,
} from '../src/ai/personas/scan/scanRanking.js';
import {
  createWatchlistScanner,
  orderScanSymbols,
  type ScanDeps,
} from '../src/ai/personas/scan/watchlistScan.js';

function doc(prediction: Record<string, unknown>, plan: Record<string, number> | null): ChartDoc {
  return {
    input: { origin: 'analyst', prediction },
    built: { kind: 'intraday', entryPlan: plan },
  } as unknown as ChartDoc;
}

describe('scan ranking', () => {
  it('measures reward-to-risk against the first target', () => {
    expect(rewardRisk(100, 95, 110)).toBe(2);
    expect(rewardRisk(100, 105, 91)).toBe(1.8);
    expect(rewardRisk(100, 100, 110)).toBeNull();
    expect(rewardRisk(null, 95, 110)).toBeNull();
  });

  it('scores conviction times capped reward-to-risk', () => {
    expect(scoreSetup(80, 2)).toBe(1.6);
    expect(scoreSetup(80, 9)).toBe(3.2);
    expect(scoreSetup(null, 2)).toBe(1);
    expect(scoreSetup(90, null)).toBe(0);
  });

  it('reads a long setup from a chart', () => {
    const setup = setupFromDoc(
      'MU.US',
      'c1',
      doc({ direction: 'long', conviction: 70 }, { entry: 100, stop: 95, target1: 110 }),
    );
    expect(setup).toMatchObject({ direction: 'long', reward_risk: 2, score: 1.4, conviction: 70 });
  });

  it('keeps a range call out of the score and records its box', () => {
    const setup = setupFromDoc(
      'MU.US',
      'c1',
      doc({ direction: 'neutral', conviction: 60, range_plan: { low: 280, high: 300 } }, null),
    );
    expect(setup).toMatchObject({ score: 0, reward_risk: null, range_low: 280, range_high: 300 });
  });

  it('returns null when the chart has no prediction', () => {
    expect(setupFromDoc('MU.US', 'c1', doc({}, null))).toBeNull();
  });

  it('ranks directional setups by score and lists ranges apart', () => {
    const base = { chart_id: 'c', entry: null, stop: null, target1: null, range_low: null, range_high: null };
    const setups: ScanSetup[] = [
      { ...base, symbol: 'A', direction: 'long', conviction: 50, reward_risk: 2, score: 1 },
      { ...base, symbol: 'B', direction: 'short', conviction: 80, reward_risk: 3, score: 2.4 },
      { ...base, symbol: 'C', direction: 'neutral', conviction: 40, reward_risk: null, score: 0 },
      { ...base, symbol: 'D', direction: 'neutral', conviction: 90, reward_risk: null, score: 0 },
    ];
    const ranked = rankSetups(setups);
    expect(ranked.setups.map((s) => s.symbol)).toEqual(['B', 'A']);
    expect(ranked.ranges.map((s) => s.symbol)).toEqual(['D', 'C']);
  });
});

interface Harness {
  deps: ScanDeps;
  finish: (symbol: string) => void;
  started: string[];
  notified: WatchlistScanState[];
}

/** Each started run stays pending until the test finishes it, so ordering is observable. */
function harness(symbols: string[], overrides: Partial<ScanDeps> = {}): Harness {
  const pending = new Map<string, () => void>();
  const started: string[] = [];
  const notified: WatchlistScanState[] = [];
  const deps: ScanDeps = {
    listSymbols: async () => symbols,
    analystReady: () => true,
    startRun: (symbol) => {
      started.push(symbol);
      const done = new Promise<void>((resolve) => pending.set(symbol, resolve));
      return { started: true, done };
    },
    findResult: async (symbol) => ({
      chartId: `chart-${symbol}`,
      doc: doc(
        { direction: 'long', conviction: symbol === 'B' ? 90 : 50 },
        { entry: 100, stop: 95, target1: 110 },
      ),
    }),
    notify: (state) => notified.push(state),
    now: () => Date.parse('2026-09-28T14:00:00Z'),
    concurrency: 2,
    maxSymbols: 20,
    maxPositions: 40,
    ...overrides,
  };
  return {
    deps,
    started,
    notified,
    finish: (symbol) => pending.get(symbol)?.(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('watchlist scanner', () => {
  it('analyses only positions, all of them up to 40, when asked for positions', async () => {
    const symbols = Array.from({ length: 25 }, (_, i) => `P${i}`);
    const listSymbols = vi.fn(async (scope: string) => (scope === 'positions' ? symbols : ['W']));
    const scanner = createWatchlistScanner(harness([], { listSymbols, maxSymbols: 20 }).deps);
    expect(await scanner.start({ scope: 'positions' })).toEqual({ started: true });
    expect(listSymbols).toHaveBeenCalledWith('positions');
    const state = scanner.status();
    expect(state.scope).toBe('positions');
    // Beyond the 20-symbol watchlist cap: a positions scan keeps every holding.
    expect(state.items).toHaveLength(25);
    expect(state.skipped_over_cap).toBe(0);
    scanner.cancel();
  });

  it('tells positions it cannot read apart from holding nothing', async () => {
    const failing = createWatchlistScanner(
      harness([], { listSymbols: async () => { throw new Error('OpenD down'); } }).deps,
    );
    expect(await failing.start({ scope: 'positions' })).toEqual({ started: false, reason: 'positions unavailable' });
    const empty = createWatchlistScanner(harness([]).deps);
    expect(await empty.start({ scope: 'positions' })).toEqual({ started: false, reason: 'no positions' });
  });

  it('runs two symbols at a time and ranks the results', async () => {
    const h = harness(['A', 'B', 'C']);
    const scanner = createWatchlistScanner(h.deps);
    expect(await scanner.start({ timeframes: ['h1', '4h', 'day'], anchorTf: '4h' })).toEqual({
      started: true,
    });
    await flush();
    expect(h.started).toEqual(['A', 'B']);
    expect(scanner.status().items.map((item) => item.status)).toEqual(['running', 'running', 'queued']);

    h.finish('A');
    await flush();
    expect(h.started).toEqual(['A', 'B', 'C']);
    h.finish('B');
    h.finish('C');
    await flush();

    const state = scanner.status();
    expect(state.running).toBe(false);
    expect(state.timeframes).toEqual(['h1', '4h', 'day']);
    expect(state.anchor_tf).toBe('4h');
    expect(state.items.every((item) => item.status === 'done')).toBe(true);
    expect(state.setups[0].symbol).toBe('B');
    expect(h.notified).toHaveLength(1);
  });

  it('passes the analysis windows and anchor to every run quietly', async () => {
    const startRun = vi.fn(() => ({ started: true as const, done: Promise.resolve() }));
    const scanner = createWatchlistScanner(harness(['A'], { startRun }).deps);
    await scanner.start({ timeframes: ['h1', '4h', 'day'], anchorTf: 'day' });
    await flush();
    expect(startRun).toHaveBeenCalledWith('A', {
      timeframes: ['h1', '4h', 'day'],
      anchorTimeframe: 'day',
      quiet: true,
    });
  });

  it('drops an anchor that is not one of the windows', async () => {
    const scanner = createWatchlistScanner(harness(['A']).deps);
    await scanner.start({ timeframes: ['m5', 'm15', 'h1'], anchorTf: 'day' });
    expect(scanner.status().anchor_tf).toBeNull();
  });

  it('refuses a second scan while one is running', async () => {
    const scanner = createWatchlistScanner(harness(['A']).deps);
    await scanner.start({});
    expect(await scanner.start({})).toEqual({ started: false, reason: 'busy' });
  });

  it('refuses to start without an analyst model', async () => {
    const scanner = createWatchlistScanner(harness(['A'], { analystReady: () => false }).deps);
    expect(await scanner.start({})).toEqual({ started: false, reason: 'analyst layer disabled' });
    expect(scanner.status().running).toBe(false);
  });

  it('reports an empty or unreadable watchlist', async () => {
    expect(await createWatchlistScanner(harness([]).deps).start({})).toEqual({
      started: false,
      reason: 'empty watchlist',
    });
    const broken = harness(['A'], {
      listSymbols: async () => {
        throw new Error('longbridge offline');
      },
    });
    expect(await createWatchlistScanner(broken.deps).start({})).toEqual({
      started: false,
      reason: 'watchlist unavailable',
    });
  });

  it('caps the scan and says how many symbols it left out', async () => {
    const scanner = createWatchlistScanner(harness(['A', 'B', 'C', 'A'], { maxSymbols: 2 }).deps);
    await scanner.start({});
    const state = scanner.status();
    expect(state.items.map((item) => item.symbol)).toEqual(['A', 'B']);
    expect(state.skipped_over_cap).toBe(1);
  });

  it('cancel stops queued symbols but lets running ones finish', async () => {
    const h = harness(['A', 'B', 'C', 'D']);
    const scanner = createWatchlistScanner(h.deps);
    await scanner.start({});
    await flush();
    scanner.cancel();
    h.finish('A');
    h.finish('B');
    await flush();
    const state = scanner.status();
    expect(h.started).toEqual(['A', 'B']);
    expect(state.items.map((item) => item.status)).toEqual(['done', 'done', 'cancelled', 'cancelled']);
    expect(state.running).toBe(false);
  });

  it('marks refused and empty runs without stopping the scan', async () => {
    const h = harness(['A', 'B'], {
      startRun: (symbol) =>
        symbol === 'A'
          ? { started: false, reason: 'already running' }
          : { started: true, done: Promise.resolve() },
      findResult: async () => null,
    });
    const scanner = createWatchlistScanner(h.deps);
    await scanner.start({});
    await flush();
    const [a, b] = scanner.status().items;
    expect(a).toMatchObject({ status: 'skipped', reason: 'already running' });
    expect(b).toMatchObject({ status: 'failed', reason: 'no prediction was submitted' });
    expect(scanner.status().running).toBe(false);
  });

  it('hands out snapshots that later updates do not change', async () => {
    const h = harness(['A']);
    const scanner = createWatchlistScanner(h.deps);
    await scanner.start({});
    await flush();
    const before = scanner.status();
    h.finish('A');
    await flush();
    expect(before.items[0].status).toBe('running');
    expect(scanner.status().items[0].status).toBe('done');
  });

  it('keeps scanning when starting one run throws', async () => {
    const h = harness(['A', 'B'], {
      startRun: (symbol) => {
        if (symbol === 'A') throw new Error('settings store unavailable');
        return { started: true, done: Promise.resolve() };
      },
    });
    const scanner = createWatchlistScanner(h.deps);
    await scanner.start({});
    await flush();
    const [a, b] = scanner.status().items;
    expect(a).toMatchObject({ status: 'failed', reason: 'settings store unavailable' });
    expect(b.status).toBe('done');
    expect(scanner.status().running).toBe(false);
  });

  it('does not let a finished scan write into the next one', async () => {
    const h = harness(['A']);
    const scanner = createWatchlistScanner(h.deps);
    await scanner.start({});
    await flush();
    h.finish('A');
    await flush();
    expect(scanner.status().running).toBe(false);
    await scanner.start({});
    const second = scanner.status();
    expect(second.running).toBe(true);
    expect(second.setups).toEqual([]);
    expect(h.notified).toHaveLength(1);
  });
});

describe('orderScanSymbols', () => {
  it('puts held positions first so the cap never drops them', () => {
    expect(orderScanSymbols(['MU.US'], ['NVDA.US', 'MU.US', 'AMD.US'], ['US'])).toEqual([
      'MU.US',
      'NVDA.US',
      'AMD.US',
    ]);
  });

  it('skips symbols from markets it cannot place instead of treating them as US', () => {
    expect(orderScanSymbols([], ['D05.SG', 'BTCUSD.HAS', 'NVDA.US', 'AAPL'], ['US'])).toEqual([
      'NVDA.US',
      'AAPL',
    ]);
  });

  it('only scans the configured watched markets', () => {
    expect(orderScanSymbols(['700.HK'], ['NVDA.US', '9988.HK'], ['US'])).toEqual(['NVDA.US']);
    expect(orderScanSymbols(['700.HK'], ['NVDA.US'], ['US', 'HK'])).toEqual(['700.HK', 'NVDA.US']);
  });
});
