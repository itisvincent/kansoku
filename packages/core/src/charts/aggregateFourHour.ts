import type { RawBar } from '@kansoku/shared/types';

export function aggregateFourHour(bars: RawBar[]): RawBar[] {
  const result: RawBar[] = [];
  let group: RawBar[] = [];
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
    const previous = group.at(-1);
    // A long gap marks a new market session (overnight/weekend). Do not make
    // a synthetic candle that spans the gap just because the source is 1h.
    if (previous && Date.parse(bar.time) - Date.parse(previous.time) > 2 * 60 * 60 * 1000) {
      flush();
    }
    group.push(bar);
    if (group.length === 4) flush();
  }
  flush();
  return result;
}
