import { tradeDirectionLabel } from '@web/lib/marketLabels';
import { translate, type Locale } from '@web/lib/i18n';
import { tfLabel, type ChartTf } from '../charts/intraday/timeframes';

export const UNKNOWN_GROUP = 'unknown';
/** Below this many settled predictions a hit rate is mostly luck, so the row is dimmed. */
export const MIN_SETTLED = 5;

const CHART_TFS = new Set<string>(['1m', 'm5', 'm15', '30m', 'h1', '4h', 'day', 'week', 'month']);

export function timeframeLabel(key: string, locale: Locale): string {
  if (key === UNKNOWN_GROUP) return translate(locale, 'scorecardUnknown');
  return CHART_TFS.has(key) ? tfLabel(key as ChartTf, locale) : key;
}

export function windowsLabel(key: string, locale: Locale): string {
  if (key === UNKNOWN_GROUP) return translate(locale, 'scorecardUnknown');
  return key
    .split(',')
    .map((tf) => timeframeLabel(tf, locale))
    .join(' + ');
}

export function directionLabel(key: string, locale: Locale): string {
  if (key === UNKNOWN_GROUP) return translate(locale, 'scorecardUnknown');
  return tradeDirectionLabel(key, locale);
}

export function formatRate(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`;
}
