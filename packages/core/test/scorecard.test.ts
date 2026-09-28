import { describe, expect, it, vi } from 'vitest';
import type {
  AnalysisOutcome,
  ChartDoc,
  ChartMeta,
  RawBar,
  ScorecardRow,
} from '@kansoku/shared/types';
import {
  buildScorecard,
  scorecardSince,
  UNKNOWN_KEY,
  windowsKey,
} from '../src/cockpit/scorecard.js';
import {
  loadScorecardRows,
  predictionWindows,
  type ScorecardSourceDeps,
} from '../src/cockpit/scorecardSource.js';

function row(overrides: Partial<ScorecardRow>): ScorecardRow {
  return {
    chart_id: 'c1',
    symbol: 'MU.US',
    created_at: '2026-09-01T14:00:00.000Z',
    url: 'http://localhost/c1',
    direction: 'long',
    anchor_tf: 'h1',
    windows: ['m5', 'm15', 'h1'],
    conviction: null,
    outcome: null,
    ...overrides,
  };
}

const win: AnalysisOutcome = { status: 'hit_target', pct_since_anchor: 3, resolved_at: 1 };
const loss: AnalysisOutcome = { status: 'hit_stop', pct_since_anchor: -2, resolved_at: 1 };
const held: AnalysisOutcome = { status: 'held_range', pct_since_anchor: 0.2, resolved_at: 1 };

describe('windowsKey', () => {
  it('orders a window set canonically', () => {
    expect(windowsKey(['day', 'h1', '4h'])).toBe('h1,4h,day');
  });

  it('dedupes and treats an empty set as unknown', () => {
    expect(windowsKey(['h1', 'h1'])).toBe('h1');
    expect(windowsKey([])).toBe(UNKNOWN_KEY);
    expect(windowsKey(null)).toBe(UNKNOWN_KEY);
  });
});

describe('buildScorecard', () => {
  it('splits hit rate by anchor timeframe in timeframe order', () => {
    const card = buildScorecard(
      [
        row({ chart_id: 'a', anchor_tf: 'day', outcome: win }),
        row({ chart_id: 'b', anchor_tf: 'h1', outcome: win }),
        row({ chart_id: 'c', anchor_tf: 'h1', outcome: loss }),
        row({ chart_id: 'd', anchor_tf: '4h', outcome: null }),
        row({ chart_id: 'e', anchor_tf: null, outcome: loss }),
      ],
      null,
    );
    expect(card.by_anchor.map((group) => group.key)).toEqual(['h1', '4h', 'day', UNKNOWN_KEY]);
    const h1 = card.by_anchor[0].bucket;
    expect(h1.total).toBe(2);
    expect(h1.win_rate).toBe(0.5);
    const fourHour = card.by_anchor[1].bucket;
    expect(fourHour.unjudged).toBe(1);
    expect(fourHour.win_rate).toBeNull();
    expect(card.overall.total).toBe(5);
  });

  it('counts a held range as a win for neutral calls', () => {
    const card = buildScorecard(
      [
        row({ chart_id: 'a', direction: 'neutral', outcome: held }),
        row({ chart_id: 'b', direction: 'short', outcome: loss }),
        row({ chart_id: 'c', direction: 'long', outcome: win }),
      ],
      null,
    );
    expect(card.by_direction.map((group) => group.key)).toEqual(['long', 'short', 'neutral']);
    expect(card.by_direction.find((group) => group.key === 'neutral')?.bucket.win_rate).toBe(1);
    expect(card.by_direction.find((group) => group.key === 'short')?.bucket.win_rate).toBe(0);
  });

  it('groups by the analysis-window set', () => {
    const card = buildScorecard(
      [
        row({ chart_id: 'a', windows: ['h1', '4h', 'day'], outcome: win }),
        row({ chart_id: 'b', windows: ['day', '4h', 'h1'], outcome: loss }),
        row({ chart_id: 'c', windows: ['m5', 'm15', 'h1'], outcome: win }),
        row({ chart_id: 'd', windows: null, outcome: win }),
      ],
      null,
    );
    expect(card.by_windows.map((group) => group.key)).toEqual([
      'm5,m15,h1',
      'h1,4h,day',
      UNKNOWN_KEY,
    ]);
    expect(card.by_windows[1].bucket.total).toBe(2);
  });

  it('lists recent predictions newest first and caps the list', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ chart_id: `c${i}`, created_at: `2026-09-0${i + 1}T14:00:00.000Z` }),
    );
    const card = buildScorecard(rows, null, 3);
    expect(card.recent.map((entry) => entry.chart_id)).toEqual(['c4', 'c3', 'c2']);
  });
});

describe('scorecardSince', () => {
  it('returns null for all history', () => {
    expect(scorecardSince(undefined, 0)).toBeNull();
    expect(scorecardSince(0, 0)).toBeNull();
    expect(scorecardSince(Number.NaN, 0)).toBeNull();
  });

  it('subtracts whole days', () => {
    const now = Date.parse('2026-09-30T00:00:00.000Z');
    expect(scorecardSince(30, now)).toBe('2026-08-31T00:00:00.000Z');
  });
});

describe('predictionWindows', () => {
  it('prefers the recorded window set', () => {
    expect(
      predictionWindows({ direction: 'long', analysis_windows: ['h1', '4h'], analysis_timeframes: ['4h'] }),
    ).toEqual(['h1', '4h']);
  });

  it('does not mistake a pinned anchor for a window set', () => {
    expect(predictionWindows({ direction: 'long', analysis_timeframes: ['4h'] })).toBeNull();
    expect(predictionWindows({ direction: 'long', analysis_timeframes: ['m5', 'm15', 'h1'] })).toEqual(
      ['m5', 'm15', 'h1'],
    );
  });
});

function bar(time: string, high: number, low: number, close: number): RawBar {
  return { time, open: close, high, low, close, volume: 1 };
}

function meta(id: string, createdAt: string): ChartMeta {
  return {
    id,
    schema_version: 1,
    type: 'intraday',
    title: id,
    symbol: 'MU.US',
    created_at: createdAt,
    updated_at: createdAt,
  } as ChartMeta;
}

function doc(origin: string, prediction: Record<string, unknown>): ChartDoc {
  return {
    input: { origin, prediction },
    built: { kind: 'intraday', entryPlan: { entry: 100, stop: 95, target1: 110 } },
  } as unknown as ChartDoc;
}

function deps(overrides: Partial<ScorecardSourceDeps> = {}): ScorecardSourceDeps {
  return {
    listCharts: async () => [],
    loadChart: async () => null,
    getResolvedOutcomes: async () => new Map(),
    saveResolvedOutcome: async () => {},
    getKline: async () => [],
    ...overrides,
  };
}

describe('loadScorecardRows', () => {
  const anchor = { timeframe: 'day', time: '2026-08-01T14:00:00Z', price: 100 };

  it('keeps AI predictions only and applies the since filter', async () => {
    const docs: Record<string, ChartDoc> = {
      ai: doc('analyst', { direction: 'long', anchor, conviction: 72 }),
      manual: doc('manual', { direction: 'long', anchor }),
      old: doc('analyst', { direction: 'long', anchor }),
    };
    const rows = await loadScorecardRows(
      '2026-08-01T00:00:00.000Z',
      deps({
        listCharts: async () => [
          meta('ai', '2026-08-02T00:00:00.000Z'),
          meta('manual', '2026-08-02T00:00:00.000Z'),
          meta('old', '2026-07-01T00:00:00.000Z'),
        ],
        loadChart: async (id) => docs[id] ?? null,
        getResolvedOutcomes: async () => new Map([['ai', win]]),
      }),
    );
    expect(rows.map((entry) => entry.chart_id)).toEqual(['ai']);
    expect(rows[0].conviction).toBe(72);
    expect(rows[0].anchor_tf).toBe('day');
    expect(rows[0].outcome?.status).toBe('hit_target');
  });

  it('falls back to hourly bars when 15-minute bars do not reach the anchor', async () => {
    const getKline = vi.fn(async (_symbol: string, period: string): Promise<RawBar[]> =>
      period === '15m'
        ? [bar('2026-09-20T14:00:00Z', 101, 99, 100), bar('2026-09-20T14:15:00Z', 101, 99, 100)]
        : [bar('2026-08-01T14:00:00Z', 101, 99, 100), bar('2026-08-02T14:00:00Z', 111, 99, 110)],
    );
    const saveResolvedOutcome = vi.fn(async () => {});
    const rows = await loadScorecardRows(
      null,
      deps({
        listCharts: async () => [meta('ai', '2026-08-01T14:00:00.000Z')],
        loadChart: async () => doc('analyst', { direction: 'long', anchor }),
        getKline,
        saveResolvedOutcome,
      }),
    );
    expect(getKline.mock.calls.map((call) => call[1])).toEqual(['15m', '1h']);
    expect(rows[0].outcome?.status).toBe('hit_target');
    expect(saveResolvedOutcome).toHaveBeenCalledOnce();
  });

  it('fetches bars once per symbol and period', async () => {
    const getKline = vi.fn(async (): Promise<RawBar[]> => [
      bar('2026-08-01T14:00:00Z', 101, 99, 100),
    ]);
    await loadScorecardRows(
      null,
      deps({
        listCharts: async () => [meta('a', '2026-08-01T14:00:00.000Z'), meta('b', '2026-08-01T14:00:00.000Z')],
        loadChart: async () => doc('analyst', { direction: 'long', anchor }),
        getKline,
      }),
    );
    expect(getKline).toHaveBeenCalledTimes(1);
  });

  it('treats a failed bar fetch as unjudged instead of throwing', async () => {
    const rows = await loadScorecardRows(
      null,
      deps({
        listCharts: async () => [meta('ai', '2026-08-01T14:00:00.000Z')],
        loadChart: async () => doc('analyst', { direction: 'long', anchor }),
        getKline: async () => {
          throw new Error('offline');
        },
      }),
    );
    expect(rows[0].outcome).toBeNull();
  });
});
