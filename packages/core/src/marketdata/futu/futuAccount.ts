import type { RawPortfolio, RawPortfolioHolding, RawPosition } from '../types.js';
import { openOpenDSession, OpenDError, PROTO, type OpenDSession } from './openDClient.js';
import { readFutuSettings, type FutuSettings } from './futuSettings.js';
import { readFutuHistoryQuota, type FutuHistoryQuota } from './futuCandles.js';

/**
 * Read-only view of the user's Futu account through OpenD: positions, holdings and the
 * watchlist, in Kansoku's symbol format. Nothing here places, changes or cancels orders.
 */

const TRD_ENV_REAL = 1;
// accStatus 1 = closed/disabled. Old single-market accounts stay listed after a move to
// a universal account; they are empty and not worth a request each.
const ACC_STATUS_DISABLED = 1;
const CURRENCY_USD = 2;
const POSITION_SIDE_SHORT = 1;
const ACCOUNT_TTL_MS = 30_000;
const WATCHLIST_TTL_MS = 5 * 60_000;
const MAX_WATCH_GROUPS = 12;

// Futu market codes → Kansoku market suffix. Trade (TrdSecMarket) and quote (QotMarket)
// use different numbers for the same market.
const TRD_SEC_MARKET: Record<number, string> = { 1: 'HK', 2: 'US', 31: 'SH', 32: 'SZ', 41: 'SG' };
const QOT_MARKET: Record<number, string> = { 1: 'HK', 11: 'US', 21: 'SH', 22: 'SZ', 31: 'SG' };
const CURRENCY: Record<number, string> = { 1: 'HKD', 2: 'USD', 3: 'CNH', 4: 'JPY', 5: 'SGD', 6: 'AUD' };
const MARKET_CURRENCY: Record<string, string> = { HK: 'HKD', US: 'USD', SH: 'CNY', SZ: 'CNY', SG: 'SGD' };
const POSITION_MARKET: Record<string, string> = { HK: 'HK', US: 'US', SH: 'CN', SZ: 'CN', SG: 'SG' };

/** `00700` + HK → `700.HK`; `AAPL` + US → `AAPL.US`; `600519` + SH → `600519.SH`. */
export function futuSymbol(code: string | undefined, suffix: string | undefined): string | null {
  if (!code || !suffix) return null;
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  // Longbridge writes Hong Kong codes without leading zeros; mainland codes keep them.
  const body = suffix === 'HK' ? trimmed.replace(/^0+(?=\d)/, '') : trimmed;
  return `${body}.${suffix}`;
}

interface FutuAcc {
  trdEnv?: number;
  accID?: string | number;
  trdMarketAuthList?: number[];
  accStatus?: number;
}

interface FutuFunds {
  totalAssets?: number;
  cash?: number;
  marketVal?: number;
}

interface FutuPosition {
  positionID?: string | number;
  positionSide?: number;
  code?: string;
  name?: string;
  qty?: number;
  canSellQty?: number;
  price?: number;
  costPrice?: number;
  averageCostPrice?: number;
  val?: number;
  secMarket?: number;
  currency?: number;
  /** Open P&L in the position's currency; `plVal` also counts realised P&L. */
  unrealizedPL?: number;
  plVal?: number;
  /** Today's P&L in the position's currency. */
  tdPlVal?: number;
}

const str = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

export function mapPosition(p: FutuPosition): { position: RawPosition; holding: RawPortfolioHolding } | null {
  const suffix = p.secMarket !== undefined ? TRD_SEC_MARKET[p.secMarket] : undefined;
  const symbol = futuSymbol(p.code, suffix);
  if (!symbol || !suffix) return null;
  const qty = Number(p.qty ?? 0);
  if (!Number.isFinite(qty) || qty === 0) return null;
  // Futu reports a short as a positive quantity with positionSide = short; Kansoku signs it.
  const signed = p.positionSide === POSITION_SIDE_SHORT ? -Math.abs(qty) : qty;
  const cost = p.averageCostPrice ?? p.costPrice;
  const currency =
    (p.currency !== undefined ? CURRENCY[p.currency] : undefined) ?? MARKET_CURRENCY[suffix] ?? '';
  const name = p.name ?? symbol;
  return {
    position: {
      symbol,
      name,
      quantity: String(signed),
      available: str(p.canSellQty),
      cost_price: str(cost),
      currency,
      market: POSITION_MARKET[suffix] ?? suffix,
    },
    holding: {
      symbol,
      name,
      currency,
      quantity: String(signed),
      cost_price: str(cost),
      market_price: str(p.price),
      market_value: str(p.val),
      // Futu's position list has no previous close; the day change is left out.
      prev_close: '',
    },
  };
}

async function withSession<T>(settings: FutuSettings, run: (s: OpenDSession) => Promise<T>): Promise<T> {
  const session = await openOpenDSession({ host: settings.host, port: settings.port });
  try {
    return await run(session);
  } finally {
    session.close();
  }
}

export interface FutuAccountSnapshot {
  accounts: number;
  positions: RawPosition[];
  holdings: RawPortfolioHolding[];
  /** Account totals in USD (OpenD converts a universal account's assets), or null. */
  overview: RawPortfolio['overview'] | null;
}

/** One position's open and today P&L, in the position's own currency. */
interface PositionPl {
  accID: string;
  currency: number;
  open: number;
  today: number;
}

function positionPl(acc: FutuAcc, p: FutuPosition): PositionPl {
  const value = (x: number | undefined) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    accID: String(acc.accID),
    currency: p.currency ?? CURRENCY_USD,
    open: value(p.unrealizedPL ?? p.plVal),
    today: value(p.tdPlVal),
  };
}

async function readFunds(
  session: OpenDSession,
  acc: FutuAcc,
  currency: number,
): Promise<FutuFunds | null> {
  try {
    const { funds } = await session.request<{ funds?: FutuFunds }>(PROTO.getFunds, {
      header: {
        trdEnv: TRD_ENV_REAL,
        accID: String(acc.accID),
        trdMarket: acc.trdMarketAuthList?.[0] ?? 1,
      },
      currency,
    });
    return funds ?? null;
  } catch (error) {
    if (error instanceof OpenDError && error.code === 'rejected') return null;
    throw error;
  }
}

/**
 * Open and today P&L in USD. A non-USD currency is converted at the rate OpenD itself uses:
 * the same account's assets priced in that currency over its assets priced in USD. A
 * currency with no such rate is left out rather than added unconverted.
 */
async function plInUsd(
  session: OpenDSession,
  accounts: FutuAcc[],
  pl: PositionPl[],
  usdAssets: Map<string, number>,
): Promise<{ open: number; today: number }> {
  const rates = new Map<string, number>();
  const rateFor = async (accID: string, currency: number): Promise<number | null> => {
    if (currency === CURRENCY_USD) return 1;
    const key = `${accID}:${currency}`;
    if (rates.has(key)) return rates.get(key) ?? null;
    const acc = accounts.find((a) => String(a.accID) === accID);
    const usd = usdAssets.get(accID) ?? 0;
    const funds = acc && usd > 0 ? await readFunds(session, acc, currency) : null;
    const local = Number(funds?.totalAssets ?? 0);
    const rate = local > 0 ? local / usd : null;
    rates.set(key, rate ?? Number.NaN);
    return rate;
  };
  let open = 0;
  let today = 0;
  for (const item of pl) {
    const rate = await rateFor(item.accID, item.currency);
    if (rate === null || !Number.isFinite(rate)) continue;
    open += item.open / rate;
    today += item.today / rate;
  }
  return { open, today };
}

async function fetchAccount(settings: FutuSettings): Promise<FutuAccountSnapshot> {
  return withSession(settings, async (session) => {
    const { accList = [] } = await session.request<{ accList?: FutuAcc[] }>(PROTO.getAccList, {
      userID: 0,
      needGeneralSecAccount: true,
    });
    const real = accList.filter(
      (acc) =>
        acc.trdEnv === TRD_ENV_REAL &&
        acc.accID !== undefined &&
        acc.accStatus !== ACC_STATUS_DISABLED,
    );
    const seen = new Set<string>();
    const positions: RawPosition[] = [];
    const holdings: RawPortfolioHolding[] = [];
    // A universal account's funds answer carries no P&L, so open and today P&L are added up
    // from the positions, per account and currency, and turned into USD further down.
    const pl: PositionPl[] = [];
    for (const acc of real) {
      // A universal account answers for every market at once; asking per authorised
      // market covers single-market accounts too. Duplicates are dropped by position id.
      const markets = acc.trdMarketAuthList?.length ? acc.trdMarketAuthList : [1];
      for (const trdMarket of markets) {
        let list: FutuPosition[] = [];
        try {
          const s2c = await session.request<{ positionList?: FutuPosition[] }>(
            PROTO.getPositionList,
            { header: { trdEnv: TRD_ENV_REAL, accID: String(acc.accID), trdMarket } },
          );
          list = s2c.positionList ?? [];
        } catch (error) {
          // One market the account cannot query (e.g. not opened) must not hide the rest.
          if (error instanceof OpenDError && error.code === 'rejected') continue;
          throw error;
        }
        for (const p of list) {
          const key = `${acc.accID}:${p.positionID ?? `${p.secMarket}:${p.code}`}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const mapped = mapPosition(p);
          if (!mapped) continue;
          positions.push(mapped.position);
          holdings.push(mapped.holding);
          pl.push(positionPl(acc, p));
        }
      }
    }
    // Totals in USD: OpenD converts a universal account's assets into the requested
    // currency, so accounts can be added up without exchange rates here.
    const totals = { assets: 0, cash: 0, market: 0, any: false };
    const usdAssets = new Map<string, number>();
    for (const acc of real) {
      const funds = await readFunds(session, acc, CURRENCY_USD);
      if (!funds) continue;
      totals.any = true;
      totals.assets += Number(funds.totalAssets ?? 0) || 0;
      totals.cash += Number(funds.cash ?? 0) || 0;
      totals.market += Number(funds.marketVal ?? 0) || 0;
      usdAssets.set(String(acc.accID), Number(funds.totalAssets ?? 0) || 0);
    }
    const { open, today } = await plInUsd(session, real, pl, usdAssets);
    const overview = totals.any
      ? {
          total_asset: String(totals.assets),
          market_cap: String(totals.market),
          total_cash: String(totals.cash),
          total_pl: String(open),
          total_today_pl: String(today),
          currency: 'USD',
        }
      : null;
    return { accounts: real.length, positions, holdings, overview };
  });
}

interface FutuSecurity {
  basic?: { security?: { market?: number; code?: string } };
}

async function fetchWatchlist(settings: FutuSettings): Promise<string[]> {
  return withSession(settings, async (session) => {
    const { groupList = [] } = await session.request<{
      groupList?: Array<{ groupName?: string; groupType?: number }>;
    }>(PROTO.getUserSecurityGroup, { groupType: 3 });
    // The system "All" group already holds every watched security; otherwise read the
    // groups one by one.
    const all = groupList.find((g) => g.groupName === '全部' || /^all$/i.test(g.groupName ?? ''));
    const names = (all ? [all] : groupList)
      .map((g) => g.groupName)
      .filter((name): name is string => Boolean(name))
      .slice(0, MAX_WATCH_GROUPS);
    const symbols = new Set<string>();
    for (const groupName of names) {
      const { staticInfoList = [] } = await session.request<{ staticInfoList?: FutuSecurity[] }>(
        PROTO.getUserSecurity,
        { groupName },
      );
      for (const info of staticInfoList) {
        const security = info.basic?.security;
        const suffix = security?.market !== undefined ? QOT_MARKET[security.market] : undefined;
        const symbol = futuSymbol(security?.code, suffix);
        if (symbol) symbols.add(symbol);
      }
    }
    return [...symbols];
  });
}

const cache = {
  account: null as { at: number; key: string; value: Promise<FutuAccountSnapshot> } | null,
  watchlist: null as { at: number; key: string; value: Promise<string[]> } | null,
};

export function resetFutuCacheForTests(): void {
  cache.account = null;
  cache.watchlist = null;
}

const settingsKey = (s: FutuSettings) => `${s.host}:${s.port}`;

/** The Futu account (cached 30s, so a burst of callers makes one OpenD round trip). */
export function readFutuAccount(settings = readFutuSettings()): Promise<FutuAccountSnapshot> {
  const key = settingsKey(settings);
  const hit = cache.account;
  if (hit && hit.key === key && Date.now() - hit.at < ACCOUNT_TTL_MS) return hit.value;
  const value = fetchAccount(settings);
  cache.account = { at: Date.now(), key, value };
  value.catch(() => {
    if (cache.account?.value === value) cache.account = null;
  });
  return value;
}

/** The Futu watchlist (cached 5 min). */
export function readFutuWatchlist(settings = readFutuSettings()): Promise<string[]> {
  const key = settingsKey(settings);
  const hit = cache.watchlist;
  if (hit && hit.key === key && Date.now() - hit.at < WATCHLIST_TTL_MS) return hit.value;
  const value = fetchWatchlist(settings);
  cache.watchlist = { at: Date.now(), key, value };
  value.catch(() => {
    if (cache.watchlist?.value === value) cache.watchlist = null;
  });
  return value;
}

export interface FutuStatus {
  enabled: boolean;
  state: 'disabled' | 'connected' | 'unreachable' | 'error';
  message: string | null;
  accounts: number;
  positions: number;
  /** Watchlist symbols Kansoku adds (after the market filter), or null when that is off. */
  watchlist: number | null;
  /** Futu's 30-day candle-history quota; null when OpenD did not answer. */
  historyQuota: FutuHistoryQuota | null;
}

/** Probes OpenD now (no cache), for the Settings card. */
export async function futuStatus(
  settings = readFutuSettings(),
  countWatchlist: (symbols: string[]) => number = (symbols) => symbols.length,
): Promise<FutuStatus> {
  if (!settings.enabled) {
    return {
      enabled: false,
      state: 'disabled',
      message: null,
      accounts: 0,
      positions: 0,
      watchlist: null,
      historyQuota: null,
    };
  }
  try {
    resetFutuCacheForTests();
    const snapshot = await readFutuAccount(settings);
    const watchlist = settings.watchlist
      ? countWatchlist(await readFutuWatchlist(settings))
      : null;
    const historyQuota = await readFutuHistoryQuota(() =>
      openOpenDSession({ host: settings.host, port: settings.port }),
    ).catch(() => null);
    return {
      enabled: true,
      state: 'connected',
      message: null,
      accounts: snapshot.accounts,
      positions: snapshot.positions.length,
      watchlist,
      historyQuota,
    };
  } catch (error) {
    const unreachable = error instanceof OpenDError && error.code === 'unreachable';
    return {
      enabled: true,
      state: unreachable ? 'unreachable' : 'error',
      message: error instanceof Error ? error.message : String(error),
      accounts: 0,
      positions: 0,
      watchlist: null,
      historyQuota: null,
    };
  }
}
