import { translate, type Locale, type MessageKey } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Dot, MarketTime } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import type { RunningReassessStatus } from './useAnalystRun';

export const PHASE_LABEL: Record<RunningReassessStatus['phase'], MessageKey> = {
  preparing: 'cockpitPhasePreparing',
  researching: 'cockpitPhaseResearching',
  writing: 'cockpitPhaseWriting',
  finalizing: 'cockpitPhaseFinalizing',
};

const ORIGIN_LABEL: Record<RunningReassessStatus['origin'], MessageKey> = {
  manual: 'cockpitOriginManual',
  escalation: 'cockpitOriginEscalation',
};

const styles = stylex.create({
  root: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'grid',
    fontVariantNumeric: 'tabular-nums',
    gap: '9px',
    gridTemplateColumns: '7px minmax(0, 1fr)',
    marginTop: '14px',
    paddingTop: '12px',
    textAlign: 'left',
  },
  indicator: {
    display: 'flex',
    paddingTop: '4px',
  },
  body: {
    minWidth: 0,
  },
  head: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 10px',
    fontSize: fontSizes.sm,
    justifyContent: 'flex-start',
  },
  phase: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  elapsed: {
    color: colors.textMuted,
    whiteSpace: 'nowrap',
  },
  activity: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.45,
    marginTop: '6px',
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: '4px',
  },
});

export function formatElapsedDuration(elapsedMs: number, locale: Locale = 'zh-CN'): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return translate(locale, 'cockpitDurationSeconds', { seconds });
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours === 0)
    return translate(locale, 'cockpitDurationMinutes', {
      minutes,
      seconds: String(seconds).padStart(2, '0'),
    });
  return translate(locale, 'cockpitDurationHours', {
    hours,
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  });
}

export function AnalysisRunDetails({ status }: { status: RunningReassessStatus }) {
  const { t: i18n, locale } = useLocale();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status.startedAt]);

  const startedAt = Date.parse(status.startedAt);
  const elapsed = Number.isFinite(startedAt)
    ? formatElapsedDuration(now - startedAt, locale)
    : i18n('cockpitUnknownTime');

  return (
    <div className={`ai-run-status ${stylex.props(styles.root).className}`}>
      <span
        className={`ai-run-status-indicator ${stylex.props(styles.indicator).className}`}
        aria-hidden="true"
      >
        <Dot tone="accent" pulse />
      </span>
      <div className={`ai-run-status-body ${stylex.props(styles.body).className}`}>
        <div className={`ai-run-status-head ${stylex.props(styles.head).className}`}>
          <span className={`ai-run-status-phase ${stylex.props(styles.phase).className}`}>
            {i18n(PHASE_LABEL[status.phase])}
          </span>
          <span className={`ai-run-status-elapsed ${stylex.props(styles.elapsed).className}`}>
            {i18n('cockpitElapsed', { origin: i18n(ORIGIN_LABEL[status.origin]), elapsed })}
          </span>
        </div>
        <div
          className={`ai-run-status-activity ${stylex.props(styles.activity).className}`}
          aria-live="polite"
        >
          {status.activity}
        </div>
        <div className={`ai-run-status-meta ${stylex.props(styles.meta).className}`}>
          {i18n('cockpitStartedAt')}
          <MarketTime value={status.startedAt} format="clock" includeZone />
          {i18n('cockpitLastActivity')}
          <MarketTime value={status.updatedAt} format="clock" includeZone />
        </div>
      </div>
    </div>
  );
}
