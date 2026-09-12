import type { CSSProperties } from 'react';
import {
  formatMarketClock,
  formatMarketDateTime,
  localMarketTimeLabel,
} from '@kansoku/shared/time';
import { theme } from '@web/lib/theme';
import { translate, type Locale } from '@web/lib/i18n';

export const tooltipContentStyle: CSSProperties = {
  backgroundColor: theme.bgSurface,
  border: `1px solid ${theme.border}`,
  borderRadius: 4,
  color: theme.textPrimary,
  fontSize: 12,
};

export const tooltipLabelStyle: CSSProperties = {
  color: theme.textSecondary,
  marginBottom: 4,
  whiteSpace: 'pre-line',
};

export const tooltipItemStyle: CSSProperties = { color: theme.textPrimary };

export function hhmm(t: number): string {
  return formatMarketClock(new Date(t));
}

export function tooltipTime(t: number, locale: Locale): string {
  const date = new Date(t);
  const local = localMarketTimeLabel(date);
  return local ? `${formatMarketDateTime(date)}\n${translate(locale, 'localTimeLabel')} ${local}` : formatMarketDateTime(date);
}
