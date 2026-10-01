import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDataProvider } from '../src/marketdata/types.js';
import { nextEarnings, resetEventCachesForTests } from '../src/marketdata/events.js';

const provider: Partial<MarketDataProvider> = {};
vi.mock('../src/marketdata/registry.js', () => ({ getProvider: () => provider }));

const report = { date: '2026-10-22', time: 'after-close' } as never;

beforeEach(() => {
  resetEventCachesForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T14:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('earnings lookups after a failure', () => {
  it('retries a failed lookup after two minutes instead of hiding it for hours', async () => {
    provider.getEarningsCalendar = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(report);
    expect(await nextEarnings('MU.US', new Date())).toBeNull();
    expect(await nextEarnings('MU.US', new Date())).toBeNull(); // within the retry window
    vi.advanceTimersByTime(2 * 60_000 + 1);
    expect(await nextEarnings('MU.US', new Date())).toEqual(report);
    expect(provider.getEarningsCalendar).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known report date when a refresh fails', async () => {
    provider.getEarningsCalendar = vi.fn().mockResolvedValueOnce(report).mockRejectedValue(new Error('down'));
    expect(await nextEarnings('MU.US', new Date())).toEqual(report);
    vi.advanceTimersByTime(6 * 60 * 60_000 + 1);
    expect(await nextEarnings('MU.US', new Date())).toEqual(report);
  });
});
