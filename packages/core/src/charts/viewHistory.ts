import type { RawBar } from '@kansoku/shared/types';
import type { MarketDataProvider } from '../marketdata/types.js';

export type HistoryStatus = 'available' | 'limited' | 'denied' | 'unavailable';
const TTL = 15 * 60_000;
const DAY = 86_400_000;
const caches = new WeakMap<
  MarketDataProvider,
  Map<string, { at: number; request: Promise<{ bars: RawBar[]; status: HistoryStatus }> }>
>();

export function mergeHistory(older: RawBar[], recent: RawBar[], cutoff = Infinity): RawBar[] {
  const byTime = new Map<number, RawBar>();
  for (const bar of [...older, ...recent]) {
    const time = Date.parse(bar.time);
    if (Number.isFinite(time) && time <= cutoff) byTime.set(time, bar);
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, bar]) => bar);
}

export async function loadViewHistory(
  provider: MarketDataProvider,
  symbol: string,
  recent: RawBar[],
  wanted: number,
  asOf?: string,
) {
  const cutoff = asOf ? Date.parse(asOf) : Infinity;
  if (Number.isNaN(cutoff)) throw new Error('Invalid chart history cutoff');
  const current = mergeHistory([], recent, cutoff);
  if (current.length >= wanted) return { bars: current, status: 'available' as const };
  if (!provider.getKlineHistory) return { bars: current, status: 'unavailable' as const };
  let cache = caches.get(provider);
  if (!cache) {
    cache = new Map();
    caches.set(provider, cache);
  }
  const key = `${symbol}|${wanted}|${asOf ?? ''}`;
  let entry = cache.get(key);
  if (!entry || Date.now() - entry.at > TTL) {
    const request = (async () => {
      let bars = current;
      let end = Math.min(cutoff, bars.length ? Date.parse(bars[0].time) : Date.now());
      for (let batch = 0; batch < 8 && bars.length < wanted; batch++) {
        const start = end - 90 * DAY;
        try {
          const fetched = await provider.getKlineHistory!(
            symbol,
            '1h',
            new Date(start).toISOString().slice(0, 10),
            new Date(end).toISOString().slice(0, 10),
            'all',
          );
          const older = mergeHistory([], fetched, Math.min(end, cutoff));
          bars = mergeHistory(older, bars, cutoff);
          const earliest = older.length ? Date.parse(older[0].time) : start;
          if (older.length && earliest >= end) break;
          end = older.length ? earliest - 1 : start;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            bars,
            status: /301607|history candlestick symbol count out of limit/.test(message)
              ? ('denied' as const)
              : ('unavailable' as const),
          };
        }
      }
      return {
        bars,
        status: bars.length >= wanted ? ('available' as const) : ('limited' as const),
      };
    })();
    if (cache.size >= 24) cache.clear();
    entry = { at: Date.now(), request };
    cache.set(key, entry);
  }
  const result = await entry.request;
  return { ...result, bars: mergeHistory(result.bars, current, cutoff) };
}
