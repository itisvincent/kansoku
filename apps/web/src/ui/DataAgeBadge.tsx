import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Badge } from './Badge';
import { translate, useLocale, type Locale } from '@web/lib/i18n';

const styles = stylex.create({
  root: {
    marginLeft: '8px',
  },
  sectionTitle: {
    marginLeft: 0,
  },
});

export function formatDataAge(ageMs: number, locale: Locale = 'zh-CN'): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return translate(locale, 'dataAgeJustNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return translate(locale, 'dataAgeMinutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate(locale, 'dataAgeHours', { count: hours });
  const days = Math.floor(hours / 24);
  return translate(locale, 'dataAgeDays', { count: days });
}

export function DataAgeBadge({
  at,
  className,
}: {
  at: number | null | undefined;
  className?: string;
}) {
  const { locale } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const [inSectionTitle, setInSectionTitle] = useState(false);

  useEffect(() => {
    if (at == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [at]);

  if (at == null) return null;

  return (
    <Badge
      tone="muted"
      ref={(node) => {
        setInSectionTitle(node?.closest('.section-title--with-age') != null);
      }}
      className={`${stylex.props(inSectionTitle ? styles.sectionTitle : styles.root).className}${className ? ` ${className}` : ''}`}
    >
      {formatDataAge(now - at, locale)}
    </Badge>
  );
}
