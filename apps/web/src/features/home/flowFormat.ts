import { translate, type Locale } from '../../lib/i18n';

function fmtMagnitude(abs: number, locale: Locale): string {
  if (locale === 'en-US') {
    if (abs >= 1e9) return `${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(abs / 1e3).toFixed(1)}K`;
    return abs.toFixed(0);
  }
  if (abs >= 1e8) return `${(abs / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${(abs / 1e4).toFixed(1)}万`;
  return abs.toFixed(0);
}

export function fmtFlow(value: number | null, locale: Locale = 'zh-CN'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${fmtMagnitude(Math.abs(value), locale)}`;
}

export function fmtFlowLabeled(value: number | null, locale: Locale = 'zh-CN'): string {
  if (value == null || !Number.isFinite(value)) return `${translate(locale, 'homeNetInflow')} —`;
  const label = translate(locale, value < 0 ? 'homeNetOutflow' : 'homeNetInflow');
  return `${label} ${fmtMagnitude(Math.abs(value), locale)}`;
}

export function flowTone(value: number | null): 'up' | 'down' | '' {
  if (value == null || value === 0) return '';
  return value > 0 ? 'up' : 'down';
}
