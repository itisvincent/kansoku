import { translate, type Locale, type MessageKey } from '../../lib/i18n';
import type {
  MarketEventClass,
  MarketEventSeverity,
  MarketEventTrust,
} from '@kansoku/shared/types';

export const EVENT_CLASS_LABEL: Record<MarketEventClass, MessageKey> = {
  macro: 'eventMacro',
  earnings: 'eventEarnings',
  filing: 'eventFiling',
  news: 'eventNews',
  policy: 'eventPolicy',
  flow: 'eventFlow',
  technical: 'eventTechnical',
};

export const EVENT_TRUST_LABEL: Record<MarketEventTrust, MessageKey> = {
  official: 'eventOfficial',
  verified: 'eventVerified',
  unverified: 'eventUnverified',
};

export const EVENT_SEVERITY_LABEL: Record<MarketEventSeverity, MessageKey> = {
  info: 'eventInfo',
  notable: 'eventNotable',
  critical: 'eventCritical',
};

const SOURCE_LABEL: Record<string, MessageKey> = {
  'sec-edgar': 'eventSourceSec',
  'market-calendar': 'eventSourceCalendar',
  'longbridge-news': 'eventSourceLongbridge',
  'kernel-triggers': 'eventSourceLocal',
  'fed-monetary': 'eventSourceFedMonetary',
  'fed-press': 'eventSourceFedPress',
  'bls-rss': 'eventSourceBls',
};

// An unknown source id is still a source: showing the raw id beats hiding a row
// that the collector is genuinely producing.
export function eventSourceLabel(source: string, locale: Locale = 'zh-CN'): string {
  return SOURCE_LABEL[source] ? translate(locale, SOURCE_LABEL[source]) : source.toUpperCase();
}

export function shortSymbol(symbol: string): string {
  return symbol.replace(/\.US$/, '');
}
