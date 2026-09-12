import { useEffect, useState } from 'react';
import { translate, useLocale, type Locale } from '@web/lib/i18n';

interface TimeAgoProps {
  since: string | null | undefined;
  format?: 'ago' | 'duration';
}

// The clock must be state the render reads: React Compiler memoizes render
// output by consumed values, so a write-only tick never refreshes the label.
export function TimeAgo({ since, format = 'ago' }: TimeAgoProps) {
  const { locale, t } = useLocale();
  const tickMs = format === 'duration' ? 1000 : 30_000;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [since, tickMs]);

  if (!since) return null;
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  if (format === 'ago') return <>{formatAgo(seconds, locale)}</>;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <>{m > 0 ? t('minutesSecondsDuration', { minutes: m, seconds: s }) : t('secondsDuration', { seconds: s })}</>;
}

function formatAgo(seconds: number, locale: Locale): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return translate(locale, 'justNow');
  if (minutes < 60) return translate(locale, 'minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate(locale, 'hoursAgo', { count: hours });
  return translate(locale, 'daysAgo', { count: Math.floor(hours / 24) });
}
