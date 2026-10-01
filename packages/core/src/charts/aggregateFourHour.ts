import type { RawBar } from '@kansoku/shared/types';
import { marketDate, marketMinuteOfDay } from '../marketdata/session.js';
import type { Market } from '../symbols/symbol.utils.js';

const BUCKET_MINUTES = 4 * 60;

/**
 * Which 4h block of the market's own clock a bar starts in (00-04, 04-08, ... local).
 * Grouping by the clock keeps every 4h candle on the same hours: grouping every four
 * source bars drifted whenever a bar was missing or a session had an odd count.
 */
function bucketOf(bar: RawBar, market: Market): string {
  const ts = Math.floor(Date.parse(bar.time) / 1000);
  const block = Math.floor(marketMinuteOfDay(market, ts) / BUCKET_MINUTES);
  return `${marketDate(market, new Date(ts * 1000))}#${block}`;
}

export function aggregateFourHour(bars: RawBar[], market: Market = 'US'): RawBar[] {
  const result: RawBar[] = [];
  let group: RawBar[] = [];
  let groupKey: string | null = null;
  const flush = () => {
    if (!group.length) return;
    result.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((bar) => Number(bar.high))),
      low: Math.min(...group.map((bar) => Number(bar.low))),
      close: group.at(-1)!.close,
      volume: group.reduce((sum, bar) => sum + Number(bar.volume), 0),
    });
    group = [];
  };

  for (const bar of bars) {
    const key = bucketOf(bar, market);
    if (key !== groupKey) {
      flush();
      groupKey = key;
    }
    group.push(bar);
  }
  flush();
  return result;
}
