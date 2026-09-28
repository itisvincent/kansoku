import type { Locale } from './i18n';

/**
 * Default chart names are frozen into saved analyses and saved tabs in whatever language was
 * active when they were made. Translate those built-in names for display; custom titles pass
 * through untouched.
 */
const DEFAULT_NAMES: readonly { 'zh-CN': string; 'en-US': string }[] = [
  { 'zh-CN': '短线多周期', 'en-US': 'intraday multi-timeframe' },
  { 'zh-CN': '主力资金流', 'en-US': 'capital flow' },
];
const COHORT = { 'zh-CN': 'cohort 对比', 'en-US': 'Cohort comparison' } as const;

export function localizeChartTitle(title: string, locale: Locale): string {
  const other: Locale = locale === 'en-US' ? 'zh-CN' : 'en-US';
  if (title === COHORT[other]) return COHORT[locale];
  for (const names of DEFAULT_NAMES) {
    const suffix = ` ${names[other]}`;
    if (title.endsWith(suffix) && title.length > suffix.length) {
      return `${title.slice(0, -suffix.length)} ${names[locale]}`;
    }
  }
  return title;
}
