import { classifySession } from '../marketdata/session.js';
import type { Market } from '../symbols/symbol.utils.js';

export type { PatternScoringContext } from '@kansoku/pro-api';

const AVG_VOL_WINDOW = 20;
const RELVOL_HIGH = 1.5;

export const SCORE_FULL_MARKER = 65;
export const SCORE_DOT_MARKER = 45;

function windowAvg(values: number[], endExclusive: number, window: number): number {
  const from = Math.max(0, endExclusive - window);
  let sum = 0;
  let count = 0;
  for (let j = from; j < endExclusive; j++) {
    if (!Number.isFinite(values[j])) continue;
    sum += values[j];
    count += 1;
  }
  return count ? sum / count : 0;
}

// Periods whose bars sit inside one session. A 4h, day or longer bar is stamped at a
// time that says nothing about the session (a US day bar can be stamped 04:00 UTC), so
// it is never treated as an overnight bar.
const SESSION_SCOPED_PERIODS = new Set([
  'm1',
  'm5',
  'm15',
  'm30',
  'h1',
  '1m',
  '5m',
  '15m',
  '30m',
  '60m',
  '1h',
]);

// Overnight bars are so thin that a structural signal (123 / divergence / beichi / MACD
// structure) anchored on one is usually noise — keep it only on a genuine volume impulse.
export function offSessionSignalKeeper(
  timesTs: number[],
  vols: number[],
  period?: string,
  market: Market = 'US',
): (time: number) => boolean {
  if (period !== undefined && !SESSION_SCOPED_PERIODS.has(period)) return () => true;
  const idxByTime = new Map<number, number>();
  for (let i = 0; i < timesTs.length; i++) idxByTime.set(timesTs[i], i);
  return (time: number) => {
    if (classifySession(time, market) !== 'overnight') return true;
    const i = idxByTime.get(time);
    if (i === undefined) return true;
    const avgVol = windowAvg(vols, i, AVG_VOL_WINDOW);
    return avgVol > 0 && vols[i] >= RELVOL_HIGH * avgVol;
  };
}
