import type { IChartApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';
import { isChartShown } from '../chartVisibility';
import { matchingBarIndex, type GridSeries } from './chartGridState';

export interface GridPane {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  /** The chart's candle times (one per candle, in order) and timeframe, read on each move. */
  read: () => GridSeries;
}

/**
 * Hovering one chart of a grid marks the matching candle in every other chart, across
 * timeframes. Only moves the user makes are followed: the marks this sets fire the charts'
 * own crosshair events, and forwarding those would bounce between charts. Charts hidden
 * behind an enlarged one are skipped.
 */
export function linkGridCrosshairs(panes: GridPane[]): () => void {
  let syncing = false;
  let driver: GridPane | null = null;

  const markOthers = (src: GridPane, mark: (dst: GridPane) => void) => {
    syncing = true;
    try {
      for (const dst of panes) {
        if (dst !== src && isChartShown(dst.chart)) mark(dst);
      }
    } finally {
      syncing = false;
    }
  };

  const subscriptions = panes.map((src) => {
    const onMove = (param: MouseEventParams) => {
      if (syncing) return;
      if (typeof param.time !== 'number') {
        // The cursor left this chart (or sits past its last candle): take down the marks
        // it placed, and leave marks placed by another chart alone.
        if (driver !== src) return;
        driver = null;
        markOthers(src, (dst) => dst.chart.clearCrosshairPosition());
        return;
      }
      if (param.sourceEvent === undefined) return;
      driver = src;
      const from = src.read();
      const time = param.time;
      markOthers(src, (dst) => {
        const to = dst.read();
        const index = matchingBarIndex(from, time, to);
        if (index === null) {
          dst.chart.clearCrosshairPosition();
          return;
        }
        const bar = dst.series.dataByIndex(index);
        const price = bar && 'close' in bar ? bar.close : 0;
        dst.chart.setCrosshairPosition(price, to.times[index] as Time, dst.series);
      });
    };
    src.chart.subscribeCrosshairMove(onMove);
    return () => src.chart.unsubscribeCrosshairMove(onMove);
  });

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
