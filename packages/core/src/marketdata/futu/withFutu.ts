import type {
  MarketDataProvider,
  RawPortfolio,
  RawPortfolioHolding,
  RawPosition,
} from '../types.js';
import { readFutuAccount, readFutuWatchlist, type FutuAccountSnapshot } from './futuAccount.js';
import { readFutuSettings, type FutuSettings } from './futuSettings.js';
import { getActiveWatchedMarketsStore } from '../watchedMarketsStore.js';
import { onAccountCacheReset } from '../accountRefresh.js';
import { ClientError } from '../../platform/errors.js';
import { getInterfaceLocale } from '../../settings/interfaceLocale.js';
import { resetFutuCacheForTests } from './futuAccount.js';

// After OpenD fails, it is left alone this long. Callers poll positions every few seconds;
// without the pause each poll tried OpenD again and logged another warning.
export const FUTU_RETRY_MS = 30_000;

const MARKET_SUFFIXES: Record<string, string[]> = { US: ['.US'], HK: ['.HK'], CN: ['.SH', '.SZ'] };

/**
 * Keeps the symbols in the user's watched markets (Settings > Display). A Futu "All"
 * watchlist mixes every market; Kansoku's market-wide views follow the configured
 * markets (TD-LANG-03), so the rest stays out.
 */
export function inWatchedMarkets(symbols: string[], markets: readonly string[]): string[] {
  const suffixes = markets.flatMap((m) => MARKET_SUFFIXES[m] ?? []);
  return symbols.filter((s) => suffixes.some((suffix) => s.toUpperCase().endsWith(suffix)));
}

export function watchedMarketsOrDefault(): string[] {
  try {
    return getActiveWatchedMarketsStore().get();
  } catch {
    return ['US'];
  }
}

export interface WithFutuDeps {
  settings: () => FutuSettings;
  watchedMarkets?: () => readonly string[];
  account: (settings: FutuSettings) => Promise<FutuAccountSnapshot>;
  watchlist: (settings: FutuSettings) => Promise<string[]>;
  warn: (message: string) => void;
  now?: () => number;
}

const defaultDeps: WithFutuDeps = {
  settings: () => readFutuSettings(),
  account: readFutuAccount,
  watchlist: readFutuWatchlist,
  warn: (message) => console.warn(`[futu] ${message}`),
};

const num = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Cost averaged over two holdings of the same symbol, weighted by size. */
function weightedCost(a: { quantity: string; cost_price: string }, b: typeof a): string {
  const qa = Math.abs(num(a.quantity));
  const qb = Math.abs(num(b.quantity));
  if (qa + qb === 0) return a.cost_price;
  return String((num(a.cost_price) * qa + num(b.cost_price) * qb) / (qa + qb));
}

/**
 * One row per symbol. Callers look positions up by symbol and take the first match, so a
 * stock held at both brokers is combined: quantities add up, cost is size-weighted.
 */
export function mergePositions(lists: RawPosition[][]): RawPosition[] {
  const bySymbol = new Map<string, RawPosition>();
  for (const position of lists.flat()) {
    const prev = bySymbol.get(position.symbol);
    if (!prev) {
      bySymbol.set(position.symbol, position);
      continue;
    }
    bySymbol.set(position.symbol, {
      ...prev,
      quantity: String(num(prev.quantity) + num(position.quantity)),
      available: String(num(prev.available) + num(position.available)),
      cost_price: weightedCost(prev, position),
    });
  }
  return [...bySymbol.values()];
}

export function mergeHoldings(lists: RawPortfolioHolding[][]): RawPortfolioHolding[] {
  const bySymbol = new Map<string, RawPortfolioHolding>();
  for (const holding of lists.flat()) {
    const prev = bySymbol.get(holding.symbol);
    if (!prev) {
      bySymbol.set(holding.symbol, holding);
      continue;
    }
    bySymbol.set(holding.symbol, {
      ...prev,
      quantity: String(num(prev.quantity) + num(holding.quantity)),
      cost_price: weightedCost(prev, holding),
      market_value: String(num(prev.market_value) + num(holding.market_value)),
      market_price: prev.market_price || holding.market_price,
    });
  }
  return [...bySymbol.values()];
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

function unwrap<T>(result: Settled<T>): T {
  if (result.ok) return result.value;
  throw result.error;
}

function combineOverview(
  own: RawPortfolio['overview'],
  futu: RawPortfolio['overview'] | null,
): RawPortfolio['overview'] {
  if (!futu || own.currency !== futu.currency) return own;
  const add = (a: string, b: string) => String(num(a) + num(b));
  return {
    currency: own.currency,
    total_asset: add(own.total_asset, futu.total_asset),
    market_cap: add(own.market_cap, futu.market_cap),
    total_cash: add(own.total_cash, futu.total_cash),
    total_pl: add(own.total_pl, futu.total_pl),
    total_today_pl: add(own.total_today_pl, futu.total_today_pl),
  };
}

/**
 * Adds the user's Futu account (through OpenD) to a market-data provider: positions,
 * portfolio holdings and the watchlist. Prices, candles and everything else still come
 * from `base`. When Futu is off this is a pass-through; when OpenD is down the base
 * answer is returned alone, so a closed OpenD never breaks the app.
 */
export function withFutu(
  base: MarketDataProvider,
  deps: WithFutuDeps = defaultDeps,
): MarketDataProvider {
  const now = deps.now ?? Date.now;
  let downUntil = 0;
  let downReason: string | null = null;
  onAccountCacheReset(() => {
    downUntil = 0;
    downReason = null;
    resetFutuCacheForTests();
  });

  const futuOn = () => {
    const settings = deps.settings();
    return settings.enabled ? settings : null;
  };
  const futuPart = async <T>(
    label: string,
    read: (s: FutuSettings) => Promise<T>,
    when: (s: FutuSettings) => boolean = () => true,
  ) => {
    const settings = futuOn();
    if (!settings || !when(settings)) return null;
    if (now() < downUntil) return null;
    try {
      const value = await read(settings);
      downReason = null;
      return value;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // Logged when it starts failing or the reason changes, not on every retry.
      if (reason !== downReason) deps.warn(`${label} unavailable: ${reason}`);
      downReason = reason;
      downUntil = now() + FUTU_RETRY_MS;
      return null;
    }
  };

  /**
   * Both brokers failed. One plain message beats the base broker's raw error, which
   * hid that Futu was the real source and only needed OpenD to be logged in.
   */
  const bothFailed = (what: 'positions' | 'portfolio', baseError: unknown): never => {
    if (!futuOn() || !downReason) throw baseError;
    const en = getInterfaceLocale() !== 'zh-CN';
    const baseMessage = baseError instanceof Error ? baseError.message : String(baseError);
    throw new ClientError(
      en
        ? `Cannot load ${what}: Futu OpenD is not reachable. Open OpenD and log in, then refresh.`
        : `读不到${what === 'positions' ? '持仓' : '账户'}：连不上富途 OpenD。请打开 OpenD 并登录，然后刷新。`,
      en ? `Longbridge: ${baseMessage}` : `长桥：${baseMessage}`,
      503,
    );
  };

  return {
    ...base,

    // The base broker can fail on its own (e.g. a Longbridge login without the trading
    // scope); the Futu answer is then still returned. Only when both fail does it throw.
    async getPositions(): Promise<RawPosition[]> {
      const [own, futu] = await Promise.all([
        settle(base.getPositions ? base.getPositions() : Promise.resolve([])),
        futuPart('positions', deps.account),
      ]);
      if (!futu) return own.ok ? own.value : bothFailed('positions', own.error);
      return own.ok ? mergePositions([own.value, futu.positions]) : futu.positions;
    },

    async getWatchlistSymbols(): Promise<string[]> {
      const [own, futu] = await Promise.all([
        settle(base.getWatchlistSymbols ? base.getWatchlistSymbols() : Promise.resolve([])),
        futuPart('watchlist', deps.watchlist, (s) => s.watchlist),
      ]);
      if (!futu) return unwrap(own);
      const added = inWatchedMarkets(futu, (deps.watchedMarkets ?? watchedMarketsOrDefault)());
      return own.ok ? [...new Set([...own.value, ...added])] : added;
    },

    ...(base.getPortfolio
      ? {
          async getPortfolio(): Promise<RawPortfolio> {
            const [own, futu] = await Promise.all([
              settle(base.getPortfolio!()),
              futuPart('portfolio', deps.account),
            ]);
            if (!futu) return own.ok ? own.value : bothFailed('portfolio', own.error);
            if (!own.ok) {
              if (!futu.overview) throw own.error;
              return { overview: futu.overview, holdings: futu.holdings };
            }
            return {
              // Totals add up only in one currency; otherwise the base broker's stand.
              overview: combineOverview(own.value.overview, futu.overview),
              holdings: mergeHoldings([own.value.holdings, futu.holdings]),
            };
          },
        }
      : {}),
  };
}
