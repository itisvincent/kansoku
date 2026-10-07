import { useEffect, useRef } from 'react';
import type { ISeriesApi } from 'lightweight-charts';
import type { Translator } from '@web/lib/i18n';
import type { IntradayBuilt, IntradayTfData } from '@kansoku/shared/types';
import { bollinger, rsi } from '@kansoku/core/analysis/indicators';
import { asTime, toCandleData } from '../lw';
import { tfDataOf, type ChartTf } from './timeframes';
import type { MaSeries } from './useMaLines';
import type { IndicatorToggleKey, MarkerRange } from './useIndicatorToggles';

export const BOLL_PERIOD = 20;
export const BOLL_K = 2;
export const RSI_PERIOD = 14;

const sameJson = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The day levels a chart draws. The day context also carries the live VWAP, which moves on
 * every push; comparing all of it made every chart redraw every time.
 */
const dayLevels = (built: IntradayBuilt) => {
  const dc = built.sidebar.dayContext;
  return dc ? [dc.prev_day, dc.pre_market, dc.opening_range] : null;
};

/**
 * Whether two chart docs draw the same chart for `tf`: its candles and everything the chart
 * reads besides them (the AI's anchor and plan, the day's levels, option walls, preview
 * levels). A live push rebuilds the whole doc, but mostly the short timeframes change; a
 * weekly, daily or 4-hour chart gets its candles from its own feed and has nothing new to
 * draw.
 */
export function sameChartInputs(a: IntradayBuilt, b: IntradayBuilt, tf: ChartTf): boolean {
  if (a === b) return true;
  if (tfDataOf(a, tf) !== tfDataOf(b, tf)) return false;
  return (
    sameJson(a.sidebar.prediction?.anchor, b.sidebar.prediction?.anchor) &&
    sameJson(a.entryPlan, b.entryPlan) &&
    sameJson(dayLevels(a), dayLevels(b)) &&
    sameJson(a.sidebar.optionsLevels, b.sidebar.optionsLevels) &&
    sameJson(a.previewLevels, b.previewLevels)
  );
}

/** Keeps handing back the previous doc while it draws the same chart, so nothing redraws. */
export function useStableChartDoc(built: IntradayBuilt, tf: ChartTf): IntradayBuilt {
  const shownRef = useRef<{ built: IntradayBuilt; tf: ChartTf } | null>(null);
  const shown = shownRef.current;
  const stable =
    shown && shown.tf === tf && sameChartInputs(shown.built, built, tf) ? shown.built : built;
  useEffect(() => {
    shownRef.current = { built: stable, tf };
  }, [stable, tf]);
  return stable;
}

/**
 * Whether `next` is `prev` with only its newest candle moved by a live price (see
 * useLiveBuilt): same candles before it, and every other series untouched. The chart can
 * then move that one candle instead of redrawing everything.
 */
export function isLastBarTick(prev: IntradayTfData, next: IntradayTfData): boolean {
  if (prev === next) return false;
  const n = next.candles.length;
  if (n < 2 || prev.candles.length !== n) return false;
  if (prev.candles[0] !== next.candles[0] || prev.candles[n - 2] !== next.candles[n - 2]) {
    return false;
  }
  if (prev.candles[n - 1].time !== next.candles[n - 1].time) return false;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (key === 'candles') continue;
    if (prev[key as keyof IntradayTfData] !== next[key as keyof IntradayTfData]) return false;
  }
  return true;
}

/** Whether a refetch brought back exactly what the chart already has. */
export function sameTfData(a: IntradayTfData | null, b: IntradayTfData | null): boolean {
  return a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));
}

/** Same moving-average lines (which, and their settings); only their values may differ. */
export function sameMaLines(a: MaSeries[], b: MaSeries[]): boolean {
  return a.length === b.length && a.every((s, i) => s.line === b[i].line);
}

export interface LiveBarSeries {
  candle: ISeriesApi<'Candlestick'>;
  emaSeries: ISeriesApi<'Line'>[];
  bollMid: ISeriesApi<'Line'>;
  bollUpper: ISeriesApi<'Line'>;
  bollLower: ISeriesApi<'Line'>;
  rsiLine: ISeriesApi<'Line'>;
}

/**
 * Moves the newest candle, and the newest point of the lines drawn from closing prices, to a
 * live price (see isLastBarTick). Signal marks and labels catch up on the next full redraw,
 * within FULL_REDRAW_MS.
 */
export function moveLastBar(
  h: LiveBarSeries,
  d: IntradayTfData,
  maSeries: MaSeries[],
  toggles: { ema: boolean; boll: boolean; rsi: boolean },
): void {
  const last = d.candles.at(-1);
  if (!last) return;
  h.candle.update(toCandleData([last])[0]);
  const time = asTime(last.time);
  const point = (value: number | null | undefined) =>
    value === null || value === undefined ? null : { time, value };
  h.emaSeries.forEach((series, i) => {
    const ma = maSeries[i];
    if (!ma || !ma.line.visible || !toggles.ema) return;
    const p = ma.data.at(-1);
    if (p && p.time === last.time) series.update({ time, value: p.value });
  });
  const closes = d.candles.map((c) => c.close);
  if (toggles.boll && closes.length >= BOLL_PERIOD) {
    const bb = bollinger(closes, BOLL_PERIOD, BOLL_K);
    for (const [series, values] of [
      [h.bollMid, bb.mid],
      [h.bollUpper, bb.upper],
      [h.bollLower, bb.lower],
    ] as const) {
      const p = point(values.at(-1));
      if (p) series.update(p);
    }
  }
  if (toggles.rsi && closes.length > RSI_PERIOD) {
    const p = point(rsi(closes, RSI_PERIOD).at(-1));
    if (p) h.rsiLine.update(p);
  }
}

/** What a chart last drew in full. */
export interface DrawnInputs {
  d: IntradayTfData;
  activeTf: ChartTf;
  toggles: Record<IndicatorToggleKey, boolean>;
  markerRange: MarkerRange;
  maSeries: MaSeries[];
  locale: string;
  tr: Translator;
  sign: string;
  sidebar: IntradayBuilt['sidebar'];
  entryPlan: IntradayBuilt['entryPlan'];
  previewLevels: IntradayBuilt['previewLevels'];
  /** When the chart was last drawn in full. */
  drawnAt: number;
}

/**
 * The longest a chart goes on moving only its newest candle. Signal marks and labels are
 * redrawn at least this often, even when the period's feed has nothing new (overnight, a
 * 4-hour chart follows the live price while its feed keeps coming back the same).
 */
export const FULL_REDRAW_MS = 15_000;

/** Whether only a live price moved since the last full draw (nothing else the chart shows). */
export function onlyLastBarMoved(drawn: DrawnInputs, next: DrawnInputs): boolean {
  return (
    drawn.activeTf === next.activeTf &&
    drawn.toggles === next.toggles &&
    drawn.markerRange === next.markerRange &&
    drawn.locale === next.locale &&
    drawn.tr === next.tr &&
    drawn.sign === next.sign &&
    drawn.sidebar === next.sidebar &&
    drawn.entryPlan === next.entryPlan &&
    drawn.previewLevels === next.previewLevels &&
    next.drawnAt - drawn.drawnAt < FULL_REDRAW_MS &&
    sameMaLines(drawn.maSeries, next.maSeries) &&
    isLastBarTick(drawn.d, next.d)
  );
}
