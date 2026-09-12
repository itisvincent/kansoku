import { useLocale, type MessageKey } from '../../lib/i18n';
import type { EventSourceStatus } from '@kansoku/core/contract/events';
import type { EventSourceHealth as SourceHealthValue } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { MarketTime, NoteBlock } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { eventSourceLabel } from './eventLabels';

const HEALTH_LABEL: Record<SourceHealthValue, MessageKey> = {
  active: 'sourceHealthActive',
  disabled: 'sourceHealthDisabled',
  degraded: 'sourceHealthDegraded',
};

const styles = stylex.create({
  numeric: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  panel: {
    borderTopColor: colors.border,
    borderTopStyle: 'dashed',
    borderTopWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingTop: '6px',
  },
  summary: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    letterSpacing: '0.02em',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  row: {
    'display': 'grid',
    'fontSize': fontSizes.xs,
    'gap': '2px 8px',
    'gridTemplateColumns': 'minmax(0, 1fr) auto',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  name: {
    color: colors.textSecondary,
  },
  state: {
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  active: {
    color: colors.ok,
  },
  degraded: {
    color: colors.down,
  },
  disabled: {
    color: colors.textMuted,
  },
  detail: {
    color: colors.textMuted,
    gridColumn: '1 / -1',
  },
  error: {
    color: colors.down,
  },
});

export interface EventSourceHealthProps {
  sources: EventSourceStatus[] | null;
  error: string | null;
  loading: boolean;
}

function Stamp({ label, at, none }: { label: string; at: string | null; none: string }) {
  if (at === null)
    return (
      <span className={`num ${stylex.props(styles.numeric).className}`}>{`${label} ${none}`}</span>
    );
  return (
    <span className={`num ${stylex.props(styles.numeric).className}`}>
      {label} <MarketTime value={at} format="month-day-time" zone="market" />
    </span>
  );
}

function SourceRow({ status }: { status: EventSourceStatus }) {
  const { t, locale } = useLocale();
  const stateStyle =
    status.health === 'active'
      ? styles.active
      : status.health === 'degraded'
        ? styles.degraded
        : styles.disabled;

  return (
    <li {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.name)}>{eventSourceLabel(status.source, locale)}</span>
      <span {...stylex.props(styles.state, stateStyle)}>{t(HEALTH_LABEL[status.health])}</span>
      <span {...stylex.props(styles.detail)}>
        {/* A source that polls fine but never emits is quiet, not healthy, so the two
            timestamps are always shown side by side instead of collapsed into one. */}
        <Stamp label={t('sourceLastPoll')} at={status.lastPolledAt} none={t('sourceNotStarted')} />
        <Stamp label={t('sourceLastEvent')} at={status.lastEventAt} none={t('sourceNoneYet')} />
      </span>
      {status.health === 'disabled' && (
        <span {...stylex.props(styles.detail)}>
          {status.disabledReason ?? t('sourceDisableReasonMissing')}
        </span>
      )}
      {status.health !== 'disabled' && status.lastError && (
        <span {...stylex.props(styles.detail, styles.error)}>{status.lastError}</span>
      )}
      {status.health === 'degraded' && (
        <span
          className={`num ${stylex.props(styles.numeric, styles.detail, styles.error).className}`}
        >
          {t('sourceFailureStreak', { count: status.failureStreak })}
          {status.nextAttemptAt && (
            <>
              {t('sourceNextRetry')}
              <MarketTime value={status.nextAttemptAt} format="clock" zone="market" />
            </>
          )}
        </span>
      )}
    </li>
  );
}

export function EventSourceHealth({ sources, error, loading }: EventSourceHealthProps) {
  const { t } = useLocale();
  if (error) return <NoteBlock>{t('sourceHealthRetry')}</NoteBlock>;
  if (loading && !sources) return <NoteBlock>{t('sourceHealthLoading')}</NoteBlock>;
  if (!sources) return null;
  if (sources.length === 0) return <NoteBlock>{t('sourceHealthEmpty')}</NoteBlock>;

  const active = sources.filter((s) => s.health === 'active').length;
  const degraded = sources.filter((s) => s.health === 'degraded').length;
  const disabled = sources.filter((s) => s.health === 'disabled').length;

  return (
    <section aria-label={t('sourceHealthLabel')} {...stylex.props(styles.panel)} role="group">
      <div className={`num ${stylex.props(styles.numeric, styles.summary).className}`}>
        {t('sourceHealthSummary', { active, degraded, disabled })}
      </div>
      <ul {...stylex.props(styles.list)}>
        {sources.map((status) => (
          <SourceRow key={status.source} status={status} />
        ))}
      </ul>
    </section>
  );
}
