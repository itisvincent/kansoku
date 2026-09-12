import { useEffect, useState, type ReactNode } from 'react';
import {
  formatClockInZone,
  formatDateTimeInZone,
  formatMarketClock,
  formatMarketDateTime,
  formatMarketMonthDayTime,
  formatMonthDayTimeInZone,
  localTimeZone,
  marketTimeZone,
  shouldShowLocalTime,
  type Market,
  type TimeInput,
} from '@kansoku/shared/time';
import { type TimeDisplayPreference, useTimeDisplayPreference } from '../lib/timeDisplayPreference';
import { Tooltip } from './Tooltip';
import { useLocale, type Locale } from '../lib/i18n';

type MarketTimeFormat = 'clock' | 'clock-seconds' | 'date-time' | 'month-day-time';

interface MarketTimePresentation {
  label: string;
  tooltip: string | null;
}

interface MarketTimeProps {
  children?: ReactNode;
  className?: string;
  focusable?: boolean;
  format?: MarketTimeFormat;
  includeZone?: boolean;
  live?: boolean;
  market?: Market;
  value: TimeInput;
  zone?: 'market' | 'preferred';
}

const MARKET_TOOLTIP_LABEL_ZH: Record<Market, string> = {
  US: '美东时间',
  HK: '港股（香港时间）',
  CN: '北京时间',
};

const MARKET_TOOLTIP_LABEL_EN: Record<Market, string> = {
  US: 'US Eastern time',
  HK: 'Hong Kong time',
  CN: 'China Standard Time',
};

function formatTime(
  value: TimeInput,
  format: MarketTimeFormat,
  includeZone: boolean | undefined,
  market: Market,
): string {
  if (format === 'clock') return formatMarketClock(value, includeZone ?? false, market);
  if (format === 'clock-seconds')
    return formatMarketClock(value, includeZone ?? false, market, true);
  if (format === 'month-day-time')
    return formatMarketMonthDayTime(value, includeZone ?? false, market);
  return formatMarketDateTime(value, includeZone ?? true, market);
}

function formatLocalTime(
  value: TimeInput,
  timeZone: string,
  format: MarketTimeFormat,
  includeZone?: boolean,
): string {
  if (format === 'clock') return formatClockInZone(value, timeZone, includeZone ?? false);
  if (format === 'clock-seconds')
    return formatClockInZone(value, timeZone, includeZone ?? false, true);
  if (format === 'month-day-time')
    return formatMonthDayTimeInZone(value, timeZone, includeZone ?? false);
  return formatDateTimeInZone(value, timeZone, includeZone ?? true);
}

export function resolveMarketTimePresentation({
  value,
  preference,
  timeZone,
  format = 'date-time',
  includeZone,
  market = 'US',
  locale = 'zh-CN',
}: {
  value: TimeInput;
  preference: TimeDisplayPreference;
  timeZone: string;
  format?: MarketTimeFormat;
  includeZone?: boolean;
  market?: Market;
  locale?: Locale;
}): MarketTimePresentation {
  const marketLabel = formatTime(value, format, includeZone, market);
  if (!shouldShowLocalTime(value, timeZone, marketTimeZone(market)))
    return { label: marketLabel, tooltip: null };

  if (preference === 'local') {
    return {
      label: formatLocalTime(value, timeZone, format, includeZone),
      tooltip: `${(locale === 'en-US' ? MARKET_TOOLTIP_LABEL_EN : MARKET_TOOLTIP_LABEL_ZH)[market]} ${formatMarketDateTime(value, true, market)}`,
    };
  }

  return {
    label: marketLabel,
    tooltip: `${locale === 'en-US' ? 'Local time' : '本地时间'} ${formatDateTimeInZone(value, timeZone, true)}`,
  };
}

export function MarketTime({
  children,
  className,
  focusable,
  format = 'date-time',
  includeZone,
  live = false,
  market = 'US',
  value,
  zone = 'preferred',
}: MarketTimeProps) {
  const { locale } = useLocale();
  const userPreference = useTimeDisplayPreference();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [live]);

  const preference: TimeDisplayPreference = zone === 'market' ? 'market' : userPreference;
  const effectiveValue: TimeInput = live ? nowMs / 1000 : value;
  const presentation = resolveMarketTimePresentation({
    value: effectiveValue,
    preference,
    timeZone: localTimeZone(),
    format,
    includeZone,
    market,
    locale,
  });
  const label = preference === 'local' ? presentation.label : (children ?? presentation.label);

  if (!presentation.tooltip) return <span className={className}>{label}</span>;

  return (
    <Tooltip className={className} content={presentation.tooltip} focusable={focusable}>
      <span>{label}</span>
    </Tooltip>
  );
}
