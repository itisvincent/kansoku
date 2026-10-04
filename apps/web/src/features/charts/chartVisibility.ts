import type { IChartApi } from 'lightweight-charts';

/**
 * A hidden chart (an indicator pane that is switched off, a grid chart behind an enlarged
 * one) has no size, and lightweight-charts throws "Value is null" when asked to place a
 * crosshair on it. Linked crosshairs skip those charts.
 */
export function isChartShown(chart: IChartApi): boolean {
  const el = chart.chartElement();
  return el.offsetWidth > 0 && el.offsetHeight > 0;
}
