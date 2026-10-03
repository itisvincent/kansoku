import type { RawBar } from '@kansoku/shared/types';
import { futuCandles, FutuPeriodNotCovered } from './futu/futuCandles.js';
import { readFutuSettings, type FutuSettings } from './futu/futuSettings.js';
import type { MarketDataProvider } from './types.js';

export interface CandleApi {
  getKline(symbol: string, period: string, count: number, session?: string): Promise<RawBar[]>;
  getKlineHistory?(
    symbol: string,
    period: string,
    start: string,
    end: string,
    session?: string,
  ): Promise<RawBar[]>;
}

export interface CandleFallbackDeps {
  settings: () => FutuSettings;
  futu: CandleApi;
  warn: (message: string) => void;
  now: () => number;
}

const defaultDeps: CandleFallbackDeps = {
  settings: () => readFutuSettings(),
  futu: futuCandles,
  warn: (message) => console.warn(`[candles] ${message}`),
  now: () => Date.now(),
};

/** A failing source is reported once in this window, not on every chart refresh. */
const WARN_EVERY_MS = 10 * 60_000;

interface Source {
  name: 'Longbridge' | 'Futu';
  api: CandleApi;
}

/**
 * Candles from the source the user chose first, and from the other one when it fails or
 * returns nothing. Futu takes part only while the Futu link is on. Everything other than
 * candles (quotes, news, positions) is the base provider's, unchanged.
 */
export function withCandleFallback(
  base: MarketDataProvider,
  deps: CandleFallbackDeps = defaultDeps,
): MarketDataProvider {
  const lastWarned = new Map<string, number>();
  const longbridge: Source = { name: 'Longbridge', api: base };
  const futu: Source = { name: 'Futu', api: deps.futu };

  function sources(): Source[] {
    const settings = deps.settings();
    if (!settings.enabled) return [longbridge];
    return settings.candles === 'futu' ? [futu, longbridge] : [longbridge, futu];
  }

  function warnOnce(key: string, message: string): void {
    const now = deps.now();
    const last = lastWarned.get(key);
    if (last !== undefined && now - last < WARN_EVERY_MS) return;
    lastWarned.set(key, now);
    deps.warn(message);
  }

  async function inOrder(
    what: string,
    symbol: string,
    call: (api: CandleApi) => Promise<RawBar[]>,
  ): Promise<RawBar[]> {
    const list = sources();
    let firstError: unknown = null;
    let notCovered: unknown = null;
    let empty: RawBar[] | null = null;
    for (const [index, source] of list.entries()) {
      try {
        const bars = await call(source.api);
        if (bars.length) return bars;
        empty ??= bars;
      } catch (error) {
        // A period Futu is not used for is not the failure worth reporting.
        if (error instanceof FutuPeriodNotCovered) notCovered ??= error;
        else firstError ??= error;
        const next = list[index + 1];
        if (next && !(error instanceof FutuPeriodNotCovered)) {
          const reason = error instanceof Error ? error.message : String(error);
          warnOnce(
            `${source.name}|${what}`,
            `${source.name} ${what} failed (${symbol}: ${reason}); using ${next.name}`,
          );
        }
      }
    }
    if (empty) return empty;
    throw firstError ?? notCovered;
  }

  return {
    ...base,
    getKline: (symbol, period, count, session) =>
      inOrder('candles', symbol, (api) => api.getKline(symbol, period, count, session)),
    getKlineHistory: (symbol, period, start, end, session) =>
      inOrder('history', symbol, (api) => {
        if (!api.getKlineHistory) return Promise.reject(new Error('no candle history'));
        return api.getKlineHistory(symbol, period, start, end, session);
      }),
  };
}
