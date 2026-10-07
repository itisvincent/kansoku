import type { IChartApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';
import { isChartShown } from '../chartVisibility';
import type { CrosshairPane } from '../lw';
import { matchingBarIndex, type GridSeries } from './chartGridState';

export interface GridPane {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  /** The chart's candle times (one per candle, in order) and timeframe, read on each move. */
  read: () => GridSeries;
  /** The indicator panes under the chart (MACD, RSI): same candles, one value each. */
  linked?: CrosshairPane[];
}

function valueAt(series: CrosshairPane['series'], index: number): number {
  const bar = series.dataByIndex(index);
  if (bar && 'value' in bar && bar.value !== undefined) return bar.value;
  return bar && 'close' in bar ? bar.close : 0;
}

/**
 * Hovering one chart of a grid, or an indicator pane under it, marks the matching candle in
 * every other chart and in their indicator panes, across timeframes. Only moves the user makes
 * are followed: the marks this sets fire the charts' own crosshair events, and forwarding those
 * would bounce between charts. Charts hidden behind an enlarged one, or switched off, are
 * skipped.
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

  const clear = (dst: GridPane) => {
    dst.chart.clearCrosshairPosition();
    for (const pane of dst.linked ?? []) {
      if (isChartShown(pane.chart)) pane.chart.clearCrosshairPosition();
    }
  };

  const onMoveFrom = (src: GridPane) => (param: MouseEventParams) => {
    if (syncing) return;
    if (typeof param.time !== 'number') {
      // The cursor left this chart (or sits past its last candle): take down the marks
      // it placed, and leave marks placed by another chart alone.
      if (driver !== src) return;
      driver = null;
      markOthers(src, clear);
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
        clear(dst);
        return;
      }
      const at = to.times[index] as Time;
      dst.chart.setCrosshairPosition(valueAt(dst.series, index), at, dst.series);
      for (const pane of dst.linked ?? []) {
        if (isChartShown(pane.chart)) {
          pane.chart.setCrosshairPosition(valueAt(pane.series, index), at, pane.series);
        }
      }
    });
  };

  const subscriptions = panes.flatMap((src) => {
    const onMove = onMoveFrom(src);
    return [src.chart, ...(src.linked ?? []).map((pane) => pane.chart)].map((chart) => {
      chart.subscribeCrosshairMove(onMove);
      return () => chart.unsubscribeCrosshairMove(onMove);
    });
  });

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
