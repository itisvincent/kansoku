import { describe, expect, it, vi } from 'vitest';
import type { ChartDoc, ScanItem, WatchlistScanState } from '@kansoku/shared/types';
import { createWatchlistScanner, type ScanDeps } from '../src/ai/personas/scan/watchlistScan.js';
import {
  INTERRUPTED_REASON,
  restoreScanState,
  type ScanStateStore,
} from '../src/ai/personas/scan/scanStateStore.js';

const longDoc = {
  input: { origin: 'analyst', prediction: { direction: 'long', conviction: 60 } },
  built: { kind: 'intraday', entryPlan: { entry: 100, stop: 95, target1: 110 } },
} as unknown as ChartDoc;

function item(symbol: string, status: ScanItem['status'], extra: Partial<ScanItem> = {}): ScanItem {
  return {
    symbol,
    status,
    chart_id: status === 'done' ? `old-${symbol}` : null,
    reason: null,
    started_at: '2026-10-02T11:50:00.000Z',
    finished_at: status === 'done' ? '2026-10-02T12:00:00.000Z' : null,
    ...extra,
  };
}

function saved(items: ScanItem[], extra: Partial<WatchlistScanState> = {}): WatchlistScanState {
  return {
    running: true,
    scope: 'positions',
    started_at: '2026-10-02T11:50:00.000Z',
    finished_at: null,
    timeframes: ['h1', '4h'],
    anchor_tf: '4h',
    items,
    setups: [
      {
        symbol: 'NVDA',
        chart_id: 'old-NVDA',
        direction: 'long',
        conviction: 70,
        entry: 100,
        stop: 95,
        target1: 110,
        reward_risk: 2,
        range_low: null,
        range_high: null,
        score: 1.4,
      },
    ],
    ranges: [],
    skipped_over_cap: 0,
    ...extra,
  };
}

function memoryStore(initial: WatchlistScanState | null) {
  const saves: WatchlistScanState[] = [];
  const store: ScanStateStore = {
    load: vi.fn(() => restoreScanState(initial)),
    save: (state) => saves.push(state),
  };
  return { store, saves };
}

function deps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  return {
    listSymbols: async () => ['A'],
    analystReady: () => true,
    startRun: () => ({ started: true, done: Promise.resolve('submitted' as const) }),
    findResult: async (symbol) => ({ chartId: `new-${symbol}`, doc: longDoc }),
    notify: () => {},
    now: () => Date.parse('2026-10-02T12:30:00Z'),
    concurrency: 2,
    maxSymbols: 20,
    maxPositions: 40,
    ...overrides,
  };
}

describe('restoreScanState', () => {
  it('marks what was waiting or mid-run when the app closed as stopped', () => {
    const state = restoreScanState(
      saved([item('NVDA', 'done'), item('MCD', 'running'), item('HSY', 'queued'), item('UBER', 'failed')]),
    );
    expect(state?.running).toBe(false);
    expect(state?.items.map((i) => [i.symbol, i.status, i.reason])).toEqual([
      ['NVDA', 'done', null],
      ['MCD', 'cancelled', INTERRUPTED_REASON],
      ['HSY', 'cancelled', INTERRUPTED_REASON],
      ['UBER', 'failed', null],
    ]);
    expect(state?.setups.map((s) => s.symbol)).toEqual(['NVDA']);
  });

  it('ignores a saved value it cannot read', () => {
    expect(restoreScanState(null)).toBeNull();
    expect(restoreScanState({ items: 'nope' })).toBeNull();
    expect(restoreScanState(saved([item('A', 'done')], { setups: [{ symbol: 1 } as never] }))).toBeNull();
  });
});

describe('scanner across a restart', () => {
  it('shows the last scan after a restart and saves every change', async () => {
    const { store, saves } = memoryStore(saved([item('NVDA', 'done'), item('MCD', 'running')]));
    const scanner = createWatchlistScanner(deps({ store }));
    expect(store.load).not.toHaveBeenCalled();
    expect(scanner.status().items.map((i) => i.status)).toEqual(['done', 'cancelled']);
    expect(store.load).toHaveBeenCalledTimes(1);

    await scanner.start({});
    await vi.waitFor(() => expect(scanner.status().running).toBe(false));
    expect(saves.at(-1)?.items.map((i) => [i.symbol, i.status])).toEqual([['A', 'done']]);
  });

  it('re-runs only failed, skipped and stopped symbols with the saved settings', async () => {
    const { store } = memoryStore(
      saved([
        item('NVDA', 'done'),
        item('UBER', 'failed', { reason: 'no prediction was submitted' }),
        item('MCD', 'running'),
        item('HOOD', 'skipped', { reason: 'already running' }),
      ]),
    );
    const startRun = vi.fn((_symbol: string, _request: unknown) => ({
      started: true as const,
      done: Promise.resolve('submitted' as const),
    }));
    const scanner = createWatchlistScanner(deps({ store, startRun }));

    expect(scanner.rerunFailed()).toEqual({ started: true });
    await vi.waitFor(() => expect(scanner.status().running).toBe(false));

    expect(startRun.mock.calls.map(([symbol]) => symbol)).toEqual(['UBER', 'MCD', 'HOOD']);
    expect(startRun.mock.calls[0][1]).toEqual({
      timeframes: ['h1', '4h'],
      anchorTimeframe: '4h',
      quiet: true,
    });
    const state = scanner.status();
    expect(state.scope).toBe('positions');
    expect(state.items.map((i) => [i.symbol, i.status, i.chart_id])).toEqual([
      ['NVDA', 'done', 'old-NVDA'],
      ['UBER', 'done', 'new-UBER'],
      ['MCD', 'done', 'new-MCD'],
      ['HOOD', 'done', 'new-HOOD'],
    ]);
    // The finished symbol's result is kept alongside the new ones.
    expect(state.setups.map((s) => s.symbol).sort()).toEqual(['HOOD', 'MCD', 'NVDA', 'UBER']);
  });

  it('says when there is nothing to re-run, or a scan is busy', async () => {
    const { store } = memoryStore(saved([item('NVDA', 'done')]));
    const scanner = createWatchlistScanner(deps({ store }));
    expect(scanner.rerunFailed()).toEqual({ started: false, reason: 'nothing to rerun' });

    const pending = createWatchlistScanner(
      deps({ startRun: () => ({ started: true, done: new Promise(() => {}) }) }),
    );
    await pending.start({});
    expect(pending.rerunFailed()).toEqual({ started: false, reason: 'busy' });
  });

  it('refuses to re-run without an analyst model', () => {
    const { store } = memoryStore(saved([item('UBER', 'failed')]));
    const scanner = createWatchlistScanner(deps({ store, analystReady: () => false }));
    expect(scanner.rerunFailed()).toEqual({ started: false, reason: 'analyst layer disabled' });
  });
});
