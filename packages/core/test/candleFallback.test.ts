import { describe, expect, it, vi } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import { withCandleFallback, type CandleApi } from '../src/marketdata/candleFallback.js';
import type { FutuSettings } from '../src/marketdata/futu/futuSettings.js';
import type { MarketDataProvider } from '../src/marketdata/types.js';

const bars = (close: number): RawBar[] => [
  { time: '2026-10-02T13:30:00.000Z', open: close, high: close, low: close, close, volume: 1 },
];

function settings(overrides: Partial<FutuSettings> = {}): FutuSettings {
  return { enabled: true, watchlist: false, candles: 'longbridge', host: '127.0.0.1', port: 11111, ...overrides };
}

function base(getKline: CandleApi['getKline'], getKlineHistory?: CandleApi['getKlineHistory']) {
  return {
    name: 'longbridge',
    capabilities: new Set(),
    getKline,
    ...(getKlineHistory ? { getKlineHistory } : {}),
    getQuotes: async () => [],
  } as unknown as MarketDataProvider;
}

describe('withCandleFallback', () => {
  it('uses Longbridge first by default and does not touch Futu when it answers', async () => {
    const futu = { getKline: vi.fn(async () => bars(2)), getKlineHistory: vi.fn() };
    const provider = withCandleFallback(base(async () => bars(1)), {
      settings: () => settings(),
      futu,
      warn: () => {},
      now: () => 0,
    });
    expect((await provider.getKline('APP.US', '1h', 10))[0].close).toBe(1);
    expect(futu.getKline).not.toHaveBeenCalled();
  });

  it('falls back to Futu when Longbridge fails or returns nothing', async () => {
    const futu = { getKline: vi.fn(async () => bars(2)), getKlineHistory: vi.fn(async () => bars(3)) };
    const warn = vi.fn();
    const provider = withCandleFallback(
      base(
        async () => {
          throw new Error('code=301607 request too many klines');
        },
        async () => [],
      ),
      { settings: () => settings(), futu, warn, now: () => 0 },
    );
    expect((await provider.getKline('APP.US', '1h', 10, 'all'))[0].close).toBe(2);
    expect(futu.getKline).toHaveBeenCalledWith('APP.US', '1h', 10, 'all');
    expect((await provider.getKlineHistory!('APP.US', '1h', '2026-08-01', '2026-09-01'))[0].close).toBe(3);
    expect(warn).toHaveBeenCalled();
  });

  it('tries Futu first when chosen, and Longbridge after it', async () => {
    const order: string[] = [];
    const futu = {
      getKline: vi.fn(async () => {
        order.push('futu');
        throw new Error('OpenD down');
      }),
      getKlineHistory: vi.fn(),
    };
    const provider = withCandleFallback(
      base(async () => {
        order.push('longbridge');
        return bars(1);
      }),
      { settings: () => settings({ candles: 'futu' }), futu, warn: () => {}, now: () => 0 },
    );
    expect((await provider.getKline('APP.US', '5m', 10))[0].close).toBe(1);
    expect(order).toEqual(['futu', 'longbridge']);
  });

  it('never calls Futu while the Futu link is off', async () => {
    const futu = { getKline: vi.fn(async () => bars(2)), getKlineHistory: vi.fn() };
    const provider = withCandleFallback(
      base(async () => {
        throw new Error('Longbridge down');
      }),
      { settings: () => settings({ enabled: false, candles: 'futu' }), futu, warn: () => {}, now: () => 0 },
    );
    await expect(provider.getKline('APP.US', '1h', 10)).rejects.toThrow('Longbridge down');
    expect(futu.getKline).not.toHaveBeenCalled();
  });

  it('reports the first source’s error when both fail', async () => {
    const futu = {
      getKline: vi.fn(async () => {
        throw new Error('OpenD down');
      }),
      getKlineHistory: vi.fn(),
    };
    const provider = withCandleFallback(
      base(async () => {
        throw new Error('code=301607 request too many klines');
      }),
      { settings: () => settings(), futu, warn: () => {}, now: () => 0 },
    );
    await expect(provider.getKline('APP.US', '1h', 10)).rejects.toThrow('301607');
  });

  it('warns about a failing source once per ten minutes, not on every call', async () => {
    let clock = 0;
    const warn = vi.fn();
    const futu = { getKline: vi.fn(async () => bars(2)), getKlineHistory: vi.fn() };
    const provider = withCandleFallback(
      base(async () => {
        throw new Error('down');
      }),
      { settings: () => settings(), futu, warn, now: () => clock },
    );
    await provider.getKline('APP.US', '1h', 10);
    await provider.getKline('NVDA.US', '1h', 10);
    expect(warn).toHaveBeenCalledTimes(1);
    clock += 11 * 60_000;
    await provider.getKline('APP.US', '1h', 10);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('keeps the rest of the provider as it was', async () => {
    const provider = withCandleFallback(base(async () => bars(1)), {
      settings: () => settings(),
      futu: { getKline: vi.fn(), getKlineHistory: vi.fn() },
      warn: () => {},
      now: () => 0,
    });
    expect(provider.name).toBe('longbridge');
    expect(await provider.getQuotes(['APP.US'])).toEqual([]);
  });
});

describe('periods Futu does not cover', () => {
  it('goes to Longbridge without a warning', async () => {
    const { FutuPeriodNotCovered } = await import('../src/marketdata/futu/futuCandles.js');
    const warn = vi.fn();
    const provider = withCandleFallback(base(async () => bars(1)), {
      settings: () => settings({ candles: 'futu' }),
      futu: {
        getKline: async () => {
          throw new FutuPeriodNotCovered('Futu candles do not cover the "week" period');
        },
        getKlineHistory: vi.fn(),
      },
      warn,
      now: () => 0,
    });
    expect((await provider.getKline('APP.US', 'week', 10))[0].close).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('error reporting with an uncovered period', () => {
  it('reports Longbridge’s error, not Futu’s skip, when both give nothing', async () => {
    const { FutuPeriodNotCovered } = await import('../src/marketdata/futu/futuCandles.js');
    const provider = withCandleFallback(
      base(async () => {
        throw new Error('Longbridge down');
      }),
      {
        settings: () => settings({ candles: 'futu' }),
        futu: {
          getKline: async () => {
            throw new FutuPeriodNotCovered('not covered');
          },
          getKlineHistory: vi.fn(),
        },
        warn: () => {},
        now: () => 0,
      },
    );
    await expect(provider.getKline('APP.US', 'week', 10)).rejects.toThrow('Longbridge down');
  });
});
