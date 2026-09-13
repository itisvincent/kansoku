import type { RawBar } from '@kansoku/shared/types';
import { aggregateFourHour } from '../../charts/aggregateFourHour.js';

export const DEFAULT_REASSESS_TFS = ['m5', 'm15', 'h1'] as const;
export const MAX_REASSESS_TFS = 3;

export const REASSESS_TF_ORDER = [
  '1m',
  'm5',
  'm15',
  '30m',
  'h1',
  '4h',
  'day',
  'week',
  'month',
] as const;

export type ReassessTf = (typeof REASSESS_TF_ORDER)[number];

const PROVIDER_PERIOD: Record<ReassessTf, string> = {
  '1m': '1m',
  m5: '5m',
  m15: '15m',
  '30m': '30m',
  h1: '1h',
  '4h': '1h',
  day: 'day',
  week: 'week',
  month: 'month',
};

const KNOWN = new Set<string>(REASSESS_TF_ORDER);

export function sanitizeReassessTimeframes(raw: unknown): ReassessTf[] {
  if (!Array.isArray(raw)) return [...DEFAULT_REASSESS_TFS];
  const wanted = new Set(raw.filter((k): k is ReassessTf => typeof k === 'string' && KNOWN.has(k)));
  const ordered = REASSESS_TF_ORDER.filter((k) => wanted.has(k)).slice(0, MAX_REASSESS_TFS);
  return ordered.length ? ordered : [...DEFAULT_REASSESS_TFS];
}

export function providerPeriodFor(tf: ReassessTf): string {
  return PROVIDER_PERIOD[tf];
}

export async function fetchAnalysisBars(
  fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>,
  symbol: string,
  tf: ReassessTf,
  count: number,
): Promise<RawBar[]> {
  if (tf === '4h') {
    const source = await fetchKline(symbol, '1h', Math.min(1000, Math.max(count * 4, count)));
    return aggregateFourHour(source).slice(-count);
  }
  return fetchKline(symbol, PROVIDER_PERIOD[tf], count);
}
