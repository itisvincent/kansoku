import type {
  MarketDataProvider,
  RawPortfolio,
  RawPortfolioHolding,
  RawPosition,
} from '../types.js';
import { readFutuAccount, readFutuWatchlist, type FutuAccountSnapshot } from './futuAccount.js';
import { readFutuSettings, type FutuSettings } from './futuSettings.js';

export interface WithFutuDeps {
  settings: () => FutuSettings;
  account: (settings: FutuSettings) => Promise<FutuAccountSnapshot>;
  watchlist: (settings: FutuSettings) => Promise<string[]>;
  warn: (message: string) => void;
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
  const futuOn = () => {
    const settings = deps.settings();
    return settings.enabled ? settings : null;
  };
  const futuPart = async <T>(label: string, read: (s: FutuSettings) => Promise<T>) => {
    const settings = futuOn();
    if (!settings) return null;
    try {
      return await read(settings);
    } catch (error) {
      deps.warn(`${label} unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  return {
    ...base,

    async getPositions(): Promise<RawPosition[]> {
      const [own, futu] = await Promise.all([
        base.getPositions ? base.getPositions() : Promise.resolve([]),
        futuPart('positions', deps.account),
      ]);
      return futu ? mergePositions([own, futu.positions]) : own;
    },

    async getWatchlistSymbols(): Promise<string[]> {
      const [own, futu] = await Promise.all([
        base.getWatchlistSymbols ? base.getWatchlistSymbols() : Promise.resolve([]),
        futuPart('watchlist', deps.watchlist),
      ]);
      return futu ? [...new Set([...own, ...futu])] : own;
    },

    ...(base.getPortfolio
      ? {
          async getPortfolio(): Promise<RawPortfolio> {
            const [own, futu] = await Promise.all([
              base.getPortfolio!(),
              futuPart('portfolio', deps.account),
            ]);
            // The account totals stay the base broker's: Futu reports its own cash in its
            // own currencies, and adding them up would need FX rates.
            return futu ? { ...own, holdings: mergeHoldings([own.holdings, futu.holdings]) } : own;
          },
        }
      : {}),
  };
}
