import type { LogicalRange } from 'lightweight-charts';
import { isChartShown } from '../chartVisibility';
import { matchingBarIndex, type GridSeries } from './chartGridState';
import type { GridPane } from './gridCrosshair';

/**
 * How long after a wheel turn or a drag a chart's scrolling still counts as the user's. A
 * plain click doesn't count: a live candle arriving just after one would otherwise drag the
 * other charts along.
 */
const USER_SCROLL_MS = 400;

/** The candle a chart shows for `time`: the matching one, or the nearest end of its history. */
function barFor(from: GridSeries, time: number, to: GridSeries): number | null {
  if (to.times.length === 0) return null;
  const index = matchingBarIndex(from, time, to);
  if (index !== null) return index;
  return time < to.times[0] ? 0 : to.times.length - 1;
}

/**
 * Scrolling or zooming one chart of a grid moves the others to the same date. Charts on
 * different timeframes can't sensibly show the same span (two days is hundreds of 5-minute
 * candles and less than one weekly candle), so each keeps its own zoom: the candle at the
 * scrolled chart's right edge, or its newest candle when that is in view, lands at the same
 * place across every chart.
 *
 * Only the user's scrolling is followed. Charts also scroll themselves (a live candle
 * arriving, older history loading in), and following those would make every chart jump
 * whenever one of them updates.
 */
export function linkGridScroll(panes: GridPane[]): () => void {
  let syncing = false;
  const userUntil = new Map<GridPane, number>();

  const follow = (src: GridPane, range: LogicalRange) => {
    const from = src.read();
    const last = from.times.length - 1;
    const width = range.to - range.from;
    if (last < 0 || width <= 0) return;
    const anchor = Math.max(0, Math.min(last, Math.floor(range.to)));
    const place = (anchor - range.from) / width;
    const time = from.times[anchor];
    syncing = true;
    try {
      for (const dst of panes) {
        if (dst === src || !isChartShown(dst.chart)) continue;
        const index = barFor(from, time, dst.read());
        if (index === null) continue;
        const scale = dst.chart.timeScale();
        const current = scale.getVisibleLogicalRange();
        const span = current ? current.to - current.from : width;
        const start = index - place * span;
        scale.setVisibleLogicalRange({ from: start, to: start + span });
      }
    } finally {
      syncing = false;
    }
  };

  const stops = panes.flatMap((src) => {
    // One chart drives at a time: starting on another hands it over, so two charts never
    // both count as the user's and push each other back and forth.
    const markUser = () => {
      userUntil.clear();
      userUntil.set(src, Date.now() + USER_SCROLL_MS);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) markUser();
    };
    const elements = [src.chart, ...(src.linked ?? []).map((pane) => pane.chart)].map((chart) =>
      chart.chartElement(),
    );
    for (const el of elements) {
      el.addEventListener('wheel', markUser, { capture: true, passive: true });
      el.addEventListener('pointermove', onPointerMove, { capture: true });
      el.addEventListener('touchmove', markUser, { capture: true, passive: true });
    }
    const onRange = (range: LogicalRange | null) => {
      if (syncing || !range || (userUntil.get(src) ?? 0) < Date.now()) return;
      follow(src, range);
    };
    const scale = src.chart.timeScale();
    scale.subscribeVisibleLogicalRangeChange(onRange);
    return [
      () => scale.unsubscribeVisibleLogicalRangeChange(onRange),
      () => {
        for (const el of elements) {
          el.removeEventListener('wheel', markUser, { capture: true });
          el.removeEventListener('pointermove', onPointerMove, { capture: true });
          el.removeEventListener('touchmove', markUser, { capture: true });
        }
      },
    ];
  });

  return () => stops.forEach((stop) => stop());
}
