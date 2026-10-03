import type { RawBar } from '@kansoku/shared/types';
import { openOpenDSession, PROTO, type OpenDSession } from './openDClient.js';
import { readFutuSettings } from './futuSettings.js';

/** Futu KLType for each period Kansoku asks for. Week and month stay on Longbridge. */
const KL_TYPE: Record<string, number> = { '1m': 1, '5m': 6, '15m': 7, '30m': 8, '1h': 9, day: 2 };
const ALIASES: Record<string, string> = { '60m': '1h' };
const BAR_SECONDS: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };
const BAR_MINUTES: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60 };
const MARKET_CODE: Record<string, number> = { US: 11, HK: 1, SH: 21, SZ: 22 };

const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
const DAY_MS = 86_400_000;
/** Futu allows 60 history requests in 30 seconds; stay a little under. */
const RATE_LIMIT = 55;
const RATE_WINDOW_MS = 30_000;
/** The longest span a `getKline(count)` call asks for. */
const MAX_SPAN_DAYS = 1100;

export interface FutuKlBar {
  time: string;
  /** Unix seconds. For intraday bars this is the bar's END; for daily bars its start. */
  timestamp: number;
  isBlank?: boolean;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: string | number;
}

export interface FutuCandleDeps {
  session: () => Promise<OpenDSession>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

/** A period Futu is not used for; the fallback goes to the other source without a warning. */
export class FutuPeriodNotCovered extends Error {}

function normalizePeriod(period: string): string {
  const normalized = ALIASES[period] ?? period;
  if (!(normalized in KL_TYPE)) {
    throw new FutuPeriodNotCovered(`Futu candles do not cover the "${period}" period`);
  }
  return normalized;
}

export function futuSecurity(symbol: string): { market: number; code: string } {
  const upper = symbol.trim().toUpperCase();
  const dot = upper.lastIndexOf('.');
  const code = dot === -1 ? upper : upper.slice(0, dot);
  const suffix = dot === -1 ? 'US' : upper.slice(dot + 1);
  const market = MARKET_CODE[suffix];
  if (!market || !code) throw new Error(`Futu has no market for ${symbol}`);
  return { market, code: suffix === 'HK' ? code.padStart(5, '0') : code };
}

/**
 * Futu stamps an intraday bar with its END time; Kansoku (like Longbridge) uses the start.
 * A bar is usually one period long, but the one before the US open (9:00–9:30) and the one
 * before the Hong Kong lunch break are shorter, so a start is never earlier than the end of
 * the bar before it.
 */
export function toRawBars(list: readonly FutuKlBar[], period: string): RawBar[] {
  const seconds = BAR_SECONDS[period];
  let previousEnd = Number.NEGATIVE_INFINITY;
  const bars: RawBar[] = [];
  for (const row of list) {
    if (row.isBlank || !Number.isFinite(row.timestamp)) continue;
    let start = row.timestamp;
    if (seconds) {
      start = row.timestamp - seconds;
      if (previousEnd > start && previousEnd < row.timestamp) start = previousEnd;
      previousEnd = row.timestamp;
    }
    bars.push({
      time: new Date(start * 1000).toISOString(),
      open: row.openPrice,
      high: row.highPrice,
      low: row.lowPrice,
      close: row.closePrice,
      volume: row.volume,
    });
  }
  return bars;
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Calendar days that hold at least `count` bars, with room for weekends and holidays. */
function spanDays(period: string, count: number, extended: boolean): number {
  const minutes = BAR_MINUTES[period];
  const barsPerDay = minutes ? (extended ? 960 : 330) / minutes : 1;
  const tradingDays = Math.ceil(count / barsPerDay);
  return Math.min(MAX_SPAN_DAYS, Math.ceil((tradingDays * 7) / 5) + 7);
}

/** Candles from Futu OpenD (Qot_RequestHistoryKL). Each new symbol uses one slot of the
 * account's 30-day history quota. */
export function createFutuCandles(deps: FutuCandleDeps) {
  let recent: number[] = [];

  async function throttle(): Promise<void> {
    const now = deps.now();
    recent = recent.filter((at) => now - at < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      await deps.sleep(recent[0] + RATE_WINDOW_MS - now);
      const after = deps.now();
      recent = recent.filter((at) => after - at < RATE_WINDOW_MS);
    }
    recent = [...recent, deps.now()];
  }

  async function fetchRange(
    symbol: string,
    period: string,
    beginTime: string,
    endTime: string,
    extended: boolean,
  ): Promise<RawBar[]> {
    const security = futuSecurity(symbol);
    const session = await deps.session();
    try {
      const rows: FutuKlBar[] = [];
      let nextReqKey: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        await throttle();
        const res = await session.request<{ klList?: FutuKlBar[]; nextReqKey?: string }>(
          PROTO.requestHistoryKL,
          {
            rehabType: 1,
            klType: KL_TYPE[period],
            security,
            beginTime,
            endTime,
            maxAckKLNum: PAGE_SIZE,
            extendedTime: extended,
            ...(nextReqKey ? { nextReqKey } : {}),
          },
        );
        rows.push(...(res.klList ?? []));
        nextReqKey = res.nextReqKey || undefined;
        if (!nextReqKey) break;
      }
      return toRawBars(rows, period);
    } finally {
      session.close();
    }
  }

  return {
    async getKline(symbol: string, period: string, count: number, session?: string): Promise<RawBar[]> {
      const normalized = normalizePeriod(period);
      const extended = session === 'all';
      const now = deps.now();
      const begin = ymd(now - spanDays(normalized, count, extended) * DAY_MS);
      const end = ymd(now + DAY_MS);
      const bars = await fetchRange(symbol, normalized, `${begin} 00:00:00`, `${end} 00:00:00`, extended);
      return bars.slice(-count);
    },

    async getKlineHistory(
      symbol: string,
      period: string,
      start: string,
      end: string,
      session?: string,
    ): Promise<RawBar[]> {
      const normalized = normalizePeriod(period);
      return fetchRange(symbol, normalized, `${start} 00:00:00`, `${end} 23:59:59`, session === 'all');
    },
  };
}

export const futuCandles = createFutuCandles({
  session: () => {
    const settings = readFutuSettings();
    return openOpenDSession({ host: settings.host, port: settings.port });
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

export interface FutuHistoryQuota {
  used: number;
  remaining: number;
}

/** How many symbols' history this account may still request in the 30-day window. */
export async function readFutuHistoryQuota(
  session: () => Promise<OpenDSession>,
): Promise<FutuHistoryQuota> {
  const opened = await session();
  try {
    const res = await opened.request<{ usedQuota?: number; remainQuota?: number }>(
      PROTO.requestHistoryKLQuota,
      { bGetDetail: false },
    );
    return { used: res.usedQuota ?? 0, remaining: res.remainQuota ?? 0 };
  } finally {
    opened.close();
  }
}
