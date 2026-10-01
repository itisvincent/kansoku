import { describe, expect, it, vi } from 'vitest';
import { createLongbridgeProvider } from '../src/marketdata/longbridge.js';

describe('history request cooldowns', () => {
  it('cools down only the symbol whose history request failed', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args.includes('BAD.US')) throw new Error('longbridge kline history failed: timeout');
      return [];
    });
    const provider = createLongbridgeProvider(run as never);
    await expect(provider.getKlineHistory!('BAD.US', '1h', '2026-01-01', '2026-02-01')).rejects.toThrow();
    await expect(provider.getKlineHistory!('MU.US', '1h', '2026-01-01', '2026-02-01')).resolves.toEqual([]);
    // The failed symbol is not asked again within the minute.
    await expect(provider.getKlineHistory!('BAD.US', '1h', '2026-01-01', '2026-02-01')).rejects.toThrow();
    expect(run.mock.calls.filter(([args]) => args.includes('BAD.US'))).toHaveLength(1);
  });

  it('blocks every symbol when the account-wide history limit is hit', async () => {
    const run = vi.fn(async () => {
      throw new Error('301607 history candlestick symbol count out of limit');
    });
    const provider = createLongbridgeProvider(run as never);
    await expect(provider.getKlineHistory!('A.US', '1h', '2026-01-01', '2026-02-01')).rejects.toThrow();
    await expect(provider.getKlineHistory!('B.US', '1h', '2026-01-01', '2026-02-01')).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
