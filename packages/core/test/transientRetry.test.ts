import { describe, expect, it, vi } from 'vitest';
import { createLongbridgeProvider, isWsConnectionError } from '../src/marketdata/longbridge.js';

describe('Longbridge connection drops', () => {
  it('retries the live connection once before falling back to the CLI', async () => {
    const queryCandlesticks = vi
      .fn()
      .mockRejectedValueOnce(new Error('Longbridge WebSocket closed'))
      .mockResolvedValueOnce([{ time: 't', open: 1, high: 1, low: 1, close: 1, volume: 1 }]);
    const run = vi.fn().mockRejectedValue(new Error('CLI should not run'));
    const provider = createLongbridgeProvider(
      run as never,
      () => ({ queryCandlesticks }) as never,
      { wsRetryDelayMs: 0 },
    );
    await expect(provider.getKline('NVDA.US', '5m', 10)).resolves.toHaveLength(1);
    expect(queryCandlesticks).toHaveBeenCalledTimes(2);
    expect(run).not.toHaveBeenCalled();
  });

  it('only treats connection drops as worth a retry', () => {
    expect(isWsConnectionError(new Error('Longbridge request timed out: 19'))).toBe(true);
    expect(isWsConnectionError(new Error('Longbridge WebSocket is not connected'))).toBe(true);
    expect(isWsConnectionError(new Error('invalid symbol'))).toBe(false);
  });
});
