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

describe('after a source fails', () => {
  function failingLongbridge(calls: string[], fail: () => boolean) {
    return base(
      async () => {
        calls.push('longbridge');
        if (fail()) throw new Error('connect timeout');
        return bars(1);
      },
      async () => {
        calls.push('longbridge-history');
        if (fail()) throw new Error('connect timeout');
        return bars(1);
      },
    );
  }

  function futuApi(calls: string[], fail = () => false) {
    return {
      getKline: vi.fn(async () => {
        calls.push('futu');
        if (fail()) throw new Error('OpenD down');
        return bars(2);
      }),
      getKlineHistory: vi.fn(async () => {
        calls.push('futu-history');
        return bars(3);
      }),
    };
  }

  it('asks the other source first for five minutes instead of waiting on the failed one again', async () => {
    let clock = 0;
    const calls: string[] = [];
    const provider = withCandleFallback(failingLongbridge(calls, () => true), {
      settings: () => settings(),
      futu: futuApi(calls),
      warn: () => {},
      now: () => clock,
    });
    await provider.getKline('APP.US', '1h', 10);
    await provider.getKline('NVDA.US', '1h', 10);
    clock += 4 * 60_000;
    await provider.getKline('ORCL.US', '1h', 10);
    expect(calls).toEqual(['longbridge', 'futu', 'futu', 'futu']);
  });

  it('tries the failed source again once the five minutes are up, and keeps it if it recovered', async () => {
    let clock = 0;
    let down = true;
    const calls: string[] = [];
    const provider = withCandleFallback(failingLongbridge(calls, () => down), {
      settings: () => settings(),
      futu: futuApi(calls),
      warn: () => {},
      now: () => clock,
    });
    await provider.getKline('APP.US', '1h', 10);
    clock += 5 * 60_000 + 1;
    down = false;
    expect((await provider.getKline('APP.US', '1h', 10))[0].close).toBe(1);
    expect((await provider.getKline('APP.US', '1h', 10))[0].close).toBe(1);
    expect(calls).toEqual(['longbridge', 'futu', 'longbridge', 'longbridge']);
  });

  it('remembers failures of older history and of recent candles separately', async () => {
    const calls: string[] = [];
    const provider = withCandleFallback(
      base(
        async () => {
          calls.push('longbridge');
          return bars(1);
        },
        async () => {
          calls.push('longbridge-history');
          throw new Error('history candlestick symbol count out of limit');
        },
      ),
      { settings: () => settings(), futu: futuApi(calls), warn: () => {}, now: () => 0 },
    );
    await provider.getKlineHistory!('APP.US', '1h', '2026-05-09', '2026-08-07');
    expect((await provider.getKline('APP.US', '1h', 10))[0].close).toBe(1);
    await provider.getKlineHistory!('APP.US', '1h', '2026-05-09', '2026-08-07');
    expect(calls).toEqual(['longbridge-history', 'futu-history', 'longbridge', 'futu-history']);
  });

  it('still falls back to the resting source when the other one fails too', async () => {
    let down = true;
    let futuDown = false;
    const calls: string[] = [];
    const provider = withCandleFallback(failingLongbridge(calls, () => down), {
      settings: () => settings(),
      futu: futuApi(calls, () => futuDown),
      warn: () => {},
      now: () => 0,
    });
    await provider.getKline('APP.US', '1h', 10);
    down = false;
    futuDown = true;
    expect((await provider.getKline('APP.US', '1h', 10))[0].close).toBe(1);
    expect(calls).toEqual(['longbridge', 'futu', 'futu', 'longbridge']);
  });

  it('does not rest a source that answered with no candles', async () => {
    const calls: string[] = [];
    const provider = withCandleFallback(
      base(async () => {
        calls.push('longbridge');
        return [];
      }),
      { settings: () => settings(), futu: futuApi(calls), warn: () => {}, now: () => 0 },
    );
    await provider.getKline('APP.US', '1h', 10);
    await provider.getKline('APP.US', '1h', 10);
    expect(calls).toEqual(['longbridge', 'futu', 'longbridge', 'futu']);
  });

  it('does not rest Futu over a period it does not cover', async () => {
    const { FutuPeriodNotCovered } = await import('../src/marketdata/futu/futuCandles.js');
    const calls: string[] = [];
    const provider = withCandleFallback(
      base(async () => {
        calls.push('longbridge');
        return bars(1);
      }),
      {
        settings: () => settings({ candles: 'futu' }),
        futu: {
          getKline: vi.fn(async (_symbol: string, period: string) => {
            calls.push('futu');
            if (period === 'week') throw new FutuPeriodNotCovered('not covered');
            return bars(2);
          }),
          getKlineHistory: vi.fn(),
        },
        warn: () => {},
        now: () => 0,
      },
    );
    await provider.getKline('APP.US', 'week', 10);
    expect((await provider.getKline('APP.US', '1h', 10))[0].close).toBe(2);
    expect(calls).toEqual(['futu', 'longbridge', 'futu']);
  });

  it('reports the chosen source’s error when every source fails, whichever went first', async () => {
    const calls: string[] = [];
    const provider = withCandleFallback(failingLongbridge(calls, () => true), {
      settings: () => settings(),
      futu: futuApi(calls, () => true),
      warn: () => {},
      now: () => 0,
    });
    await expect(provider.getKline('APP.US', '1h', 10)).rejects.toThrow('connect timeout');
    await expect(provider.getKline('APP.US', '1h', 10)).rejects.toThrow('connect timeout');
  });

  it('says in the warning that the other source goes first for a while', async () => {
    const warn = vi.fn();
    const calls: string[] = [];
    const provider = withCandleFallback(failingLongbridge(calls, () => true), {
      settings: () => settings(),
      futu: futuApi(calls),
      warn,
      now: () => 0,
    });
    await provider.getKline('APP.US', '1h', 10);
    expect(warn.mock.calls[0][0]).toMatch(/using Futu first for the next 5 minutes/);
  });
});
