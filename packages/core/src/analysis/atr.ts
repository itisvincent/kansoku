import type { RawBar } from '@kansoku/shared/types';

/**
 * Wilder's average true range: seeded with the simple mean of the first `period` true ranges,
 * then smoothed as ATR = (prev × (period − 1) + TR) / period. Returns the latest value, or null
 * when there are not enough bars.
 */
export function wilderAtr(bars: readonly RawBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const high = Number(bars[i].high);
    const low = Number(bars[i].low);
    const prevClose = Number(bars[i - 1].close);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    if (!Number.isFinite(tr)) return null;
    trueRanges.push(tr);
  }
  let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  for (let i = period; i < trueRanges.length; i += 1) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}
