import type { IntradayTfData, RawBar } from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';
import { MACD_MIN_BARS } from '../analysis/intraday/constants.js';
import { buildTimeframeView } from '../analysis/intraday/orchestrator.js';
import { coerceIntradayTimeframe } from '../analysis/intraday/timeframe.js';
import { getProvider } from '../marketdata/registry.js';
import { marketOf, type Market } from '../symbols/symbol.utils.js';
import { classifySession, marketDate } from '../marketdata/session.js';
import { loadViewHistory, type HistoryStatus } from './viewHistory.js';
import { aggregateFourHour } from './aggregateFourHour.js';

export const VIEW_PERIODS = ['1m', '30m', '4h', 'day', 'week', 'month'] as const;
export type ViewPeriod = (typeof VIEW_PERIODS)[number];

const DEFAULT_COUNT = 1000;
const MAX_COUNT = 2000;
// Longbridge rejects intraday requests above 1,000 candles. A 4h view uses
// hourly source candles, so the source request is capped while still yielding
// enough aggregated bars for the requested view.
const MAX_SOURCE_COUNT = 1000;
const CACHE_TTL_MS = 5_000;
const CACHE_MAX_ENTRIES = 48;

export interface ViewTimeframeResult {
  period: ViewPeriod;
  bars: number;
  tf: IntradayTfData;
  historyStatus?: HistoryStatus;
}

const cache = new Map<string, { at: number; value: ViewTimeframeResult }>();

function isViewPeriod(period: string): period is ViewPeriod {
  return (VIEW_PERIODS as readonly string[]).includes(period);
}

function clampCount(raw: number | string | undefined): number {
  const count = Math.trunc(Number(raw ?? DEFAULT_COUNT));
  if (!Number.isFinite(count) || count <= 0) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(MACD_MIN_BARS, count));
}

const INTRADAY_SOURCE_MS: Record<string, number> = {
  '1m': 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
};
const WEEK_MS = 7 * 86_400_000;

/**
 * Whether a bar had finished by the cutoff. A bar fetched today carries its whole range,
 * so keeping the bar that contains the analysis time would show the analysis a high and
 * low that came after it.
 */
export function barClosedBy(
  barTime: string,
  period: string,
  cutoffMs: number,
  market: Market,
): boolean {
  const start = Date.parse(barTime);
  if (!Number.isFinite(start)) return false;
  const length = INTRADAY_SOURCE_MS[period];
  if (length !== undefined) return start + length <= cutoffMs;
  if (period === 'day') {
    const barDate = marketDate(market, new Date(start));
    const cutoffDate = marketDate(market, new Date(cutoffMs));
    if (barDate !== cutoffDate) return barDate < cutoffDate;
    // Same day: complete only once the regular session is over.
    const session = classifySession(Math.floor(cutoffMs / 1000), market);
    return session === 'post' || session === 'overnight';
  }
  if (period === 'week') return start + WEEK_MS <= cutoffMs;
  if (period === 'month') {
    return (
      marketDate(market, new Date(start)).slice(0, 7) <
      marketDate(market, new Date(cutoffMs)).slice(0, 7)
    );
  }
  return start <= cutoffMs;
}

function truncateAt(
  bars: RawBar[],
  asOf: string | undefined,
  period: string,
  market: Market,
): RawBar[] {
  if (!asOf) return bars;
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) return bars;
  return bars.filter((b) => barClosedBy(b.time, period, cutoff, market));
}

export async function buildViewTimeframe(input: {
  symbol: string;
  period: string;
  count?: number | string;
  as_of?: string;
}): Promise<ViewTimeframeResult> {
  const symbol = input.symbol;
  if (!symbol) throw new ClientError('view-timeframe: `symbol` is required');
  if (!isViewPeriod(input.period)) {
    throw new ClientError(
      `view-timeframe: unsupported period ${JSON.stringify(input.period)}`,
      `period must be one of ${VIEW_PERIODS.join(' | ')}; the 5m/15m/1h analysis timeframes come from the chart doc itself`,
    );
  }
  const period = input.period;
  const count = clampCount(input.count);
  const asOf = input.as_of;

  const key = `${symbol}|${period}|${count}|${asOf ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const sourcePeriod = period === '4h' ? '1h' : period;
  const sourceCount = period === '4h' ? Math.min(MAX_SOURCE_COUNT, count * 4) : count;
  const market = marketOf(symbol);
  const provider = getProvider(market);
  let sourceBars = truncateAt(
    await provider.getKline(symbol, sourcePeriod, sourceCount, 'all'),
    asOf,
    sourcePeriod,
    market,
  );
  let historyStatus: HistoryStatus | undefined;
  if (period === '4h') {
    const history = await loadViewHistory(provider, symbol, sourceBars, count * 4, asOf);
    sourceBars = truncateAt(history.bars, asOf, sourcePeriod, market);
    historyStatus = history.status;
  }
  const bars = (
    period === '4h' ? aggregateFourHour(sourceBars, marketOf(symbol)) : sourceBars
  ).slice(-count);
  if (bars.length < MACD_MIN_BARS) {
    throw new ClientError(
      asOf
        ? `view-timeframe: only ${bars.length} ${period} bars exist at or before ${asOf}`
        : `view-timeframe: only ${bars.length} ${period} bars available for ${symbol}`,
      asOf
        ? '该周期取不到分析时刻的数据——分钟级历史深度有限，换更大的周期或看最新的图'
        : `need at least ${MACD_MIN_BARS} bars for MACD warm-up`,
    );
  }

  const coerced = coerceIntradayTimeframe(bars, period, undefined, marketOf(symbol));
  const value: ViewTimeframeResult = {
    period,
    bars: bars.length,
    tf: buildTimeframeView(coerced, period, symbol),
    ...(historyStatus ? { historyStatus } : {}),
  };

  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}
