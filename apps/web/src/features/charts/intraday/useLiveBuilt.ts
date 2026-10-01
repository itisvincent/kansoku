import { useMemo } from 'react';
import type { IntradayBuilt, IntradayTfData } from '@kansoku/shared/types';
import { useLiveQuote } from '@web/features/quotes/useLiveQuote';
import { isViewPeriod, tfDataOf, withViewTimeframe, type ChartTf } from './timeframes';

/**
 * Day, week and month candles are built from the regular session only. The session price
 * (pre-market, after-hours, overnight) belongs on intraday bars; patched onto a daily
 * candle it would rewrite the day's close and range with off-hours trades.
 */
const REGULAR_SESSION_PERIODS = new Set<ChartTf>(['day', 'week', 'month']);

export function applyLiveQuote(
  tf: IntradayTfData,
  last: number | null | undefined,
): IntradayTfData {
  const bar = tf.candles.at(-1);
  if (!bar || last == null || !Number.isFinite(last) || last <= 0) return tf;
  if (bar.close === last) return tf;
  const patched = {
    ...bar,
    close: last,
    high: Math.max(bar.high, last),
    low: Math.min(bar.low, last),
  };
  return { ...tf, candles: [...tf.candles.slice(0, -1), patched] };
}

export function livePriceFor(
  activeTf: ChartTf,
  quote: { last?: number | null; regularLast?: number | null } | null | undefined,
): number | null | undefined {
  return REGULAR_SESSION_PERIODS.has(activeTf) ? quote?.regularLast : quote?.last;
}

export function useLiveBuilt(
  built: IntradayBuilt,
  activeTf: ChartTf,
  symbol: string,
  live: boolean,
): IntradayBuilt {
  const quote = useLiveQuote(live ? symbol : null);
  const price = livePriceFor(activeTf, quote);
  return useMemo(() => {
    if (!isViewPeriod(activeTf)) return built;
    const tf = tfDataOf(built, activeTf);
    if (!tf) return built;
    const patched = applyLiveQuote(tf, price);
    return patched === tf ? built : withViewTimeframe(built, activeTf, patched);
  }, [built, activeTf, price]);
}
