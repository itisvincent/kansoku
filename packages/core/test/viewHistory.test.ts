import { describe, expect, it, vi } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import type { MarketDataProvider } from '../src/marketdata/types.js';
import { loadViewHistory } from '../src/charts/viewHistory.js';
import { createLongbridgeProvider } from '../src/marketdata/longbridge.js';

const bar = (day: string, close = 100): RawBar => ({
  time: `${day}T15:00:00Z`,
  open: 100,
  high: 102,
  low: 98,
  close,
  volume: 10,
});

describe('older four-hour source data', () => {
  it('pages backwards, merges overlaps by timestamp, and keeps the current quote', async () => {
    const getKlineHistory = vi
      .fn()
      .mockResolvedValueOnce([bar('2026-07-03', 90), bar('2026-07-01'), bar('2026-07-02')])
      .mockResolvedValueOnce([bar('2026-06-30'), bar('2026-06-29')]);
    const provider = { getKlineHistory } as unknown as MarketDataProvider;
    const result = await loadViewHistory(provider, 'AAPL.US', [bar('2026-07-03', 101)], 5);
    expect(result.status).toBe('available');
    expect(result.bars.map((b) => b.time.slice(0, 10))).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
    expect(result.bars.at(-1)?.close).toBe(101);
    expect(getKlineHistory.mock.calls[1][3]).toBe('2026-07-01');
    const refreshed = await loadViewHistory(provider, 'AAPL.US', [bar('2026-07-03', 102)], 5);
    expect(getKlineHistory).toHaveBeenCalledTimes(2);
    expect(refreshed.bars.at(-1)?.close).toBe(102);
  });

  it('excludes all data after an archived cutoff, including rows returned outside the requested window', async () => {
    const getKlineHistory = vi
      .fn()
      .mockResolvedValue([
        bar('2026-07-01'),
        bar('2026-07-02'),
        bar('2026-07-03'),
        bar('2026-07-04'),
      ]);
    const provider = { getKlineHistory } as unknown as MarketDataProvider;
    const result = await loadViewHistory(
      provider,
      'OLD.US',
      [bar('2026-07-04')],
      2,
      '2026-07-02T16:00:00Z',
    );
    expect(result.bars.map((b) => b.time.slice(0, 10))).toEqual(['2026-07-01', '2026-07-02']);
  });

  it('retains recent candles and a clear entitlement status without repeated denied requests', async () => {
    const run = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'code=301607: history candlestick symbol count out of limit, requested:0/limit:0',
        ),
      );
    const provider = createLongbridgeProvider(run);
    const recent = [bar('2026-07-03')];
    const result = await loadViewHistory(provider, 'AAPL.US', recent, 4000);
    expect(result).toEqual({ bars: recent, status: 'denied' });
    await loadViewHistory(provider, 'AAPL.US', recent, 4000);
    await loadViewHistory(provider, 'MSFT.US', recent, 4000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toEqual([
      'kline',
      'history',
      'AAPL.US',
      '--period',
      '1h',
      '--start',
      '2026-04-04',
      '--end',
      '2026-07-03',
      '--session',
      'all',
    ]);
  });

  it('bounds empty historical requests and reports limited coverage', async () => {
    const getKlineHistory = vi.fn().mockResolvedValue([]);
    const result = await loadViewHistory(
      { getKlineHistory } as unknown as MarketDataProvider,
      'EMPTY.US',
      [bar('2026-07-03')],
      4000,
    );
    expect(result.status).toBe('limited');
    expect(getKlineHistory).toHaveBeenCalledTimes(8);
  });
});
