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

/**
 * After a source fails, the other one goes first for this long. A source that is down
 * often fails by timing out (Longbridge's CLI waits up to 60s), and asking it first on
 * every chart refresh made each one wait that long before falling back.
 */
const REST_MS = 5 * 60_000;

interface Source {
  name: 'Longbridge' | 'Futu';
  api: CandleApi;
}

/**
 * Candles from the source the user chose first, and from the other one when it fails or
 * returns nothing. A source that just failed rests for five minutes: the other one goes
 * first, and the resting one is still tried last. Recent candles and older history rest
 * separately, since an account can have one without the other. Futu takes part only while
 * the Futu link is on. Everything other than candles (quotes, news, positions) is the base
 * provider's, unchanged.
 */
export function withCandleFallback(
  base: MarketDataProvider,
  deps: CandleFallbackDeps = defaultDeps,
): MarketDataProvider {
  const lastWarned = new Map<string, number>();
  const restingUntil = new Map<string, number>();
  const longbridge: Source = { name: 'Longbridge', api: base };
  const futu: Source = { name: 'Futu', api: deps.futu };

  function sources(): Source[] {
    const settings = deps.settings();
    if (!settings.enabled) return [longbridge];
    return settings.candles === 'futu' ? [futu, longbridge] : [longbridge, futu];
  }

  /** The user's order, with sources that are resting moved to the end. */
  function ordered(what: string, chosen: Source[]): Source[] {
    const now = deps.now();
    const resting = (source: Source) => (restingUntil.get(`${source.name}|${what}`) ?? 0) > now;
    return [...chosen.filter((s) => !resting(s)), ...chosen.filter(resting)];
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
    const chosen = sources();
    const list = ordered(what, chosen);
    const errors = new Map<Source, unknown>();
    let notCovered: unknown = null;
    let empty: RawBar[] | null = null;
    for (const [index, source] of list.entries()) {
      const key = `${source.name}|${what}`;
      try {
        const bars = await call(source.api);
        restingUntil.delete(key);
        if (bars.length) return bars;
        empty ??= bars;
      } catch (error) {
        // A period Futu is not used for is not a failure, and not a reason to rest it.
        if (error instanceof FutuPeriodNotCovered) {
          notCovered ??= error;
          continue;
        }
        errors.set(source, error);
        restingUntil.set(key, deps.now() + REST_MS);
        const next = list[index + 1];
        if (next) {
          const reason = error instanceof Error ? error.message : String(error);
          warnOnce(
            key,
            `${source.name} ${what} failed (${symbol}: ${reason}); using ${next.name} first for the next ${REST_MS / 60_000} minutes`,
          );
        }
      }
    }
    if (empty) return empty;
    // Report the error of the source the user chose first, whichever was tried first.
    const reported = chosen.find((source) => errors.has(source));
    throw reported ? errors.get(reported) : notCovered;
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
