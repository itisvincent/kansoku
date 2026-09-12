import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import * as stylex from '@stylexjs/stylex';
import type { TrainerStatBlock, TrainerStats } from '@kansoku/pro-api';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { fmt, signed } from '@web/lib/format';
import { Card, SectionTitle } from '@web/ui';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import { trainerCaseTagLabel } from './caseTagLabels';
import { useLocale } from '../../lib/i18n';

const pct = (value: number | null): string => (value === null ? '—' : `${fmt(value * 100, 0)}%`);

const styles = stylex.create({
  orderStatus: {
    color: colors.textSecondary,
  },
  orderError: {
    color: colors.down,
    fontSize: fontSizes.sm,
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
  },
  back: {
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'marginLeft': '10px',
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
  grid: {
    display: 'grid',
    gap: '10px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  },
  keyValue: {
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '10px',
    justifyContent: 'space-between',
    padding: '3px 0',
  },
  keyValueValue: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  settleHint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  figures: {
    display: 'grid',
    gap: '8px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  },
  figure: {
    backgroundColor: colors.backgroundSurface,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    margin: 0,
    padding: '12px 15px',
  },
  figureCaption: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  figureValue: {
    fontFamily: fonts.mono,
    fontSize: '26px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
  },
  figureSub: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  locked: {
    backgroundImage:
      'repeating-linear-gradient(135deg, transparent, transparent 5px, rgb(255 255 255 / 0.028) 5px, rgb(255 255 255 / 0.028) 10px)',
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'dashed',
    borderWidth: '1px',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    padding: '12px 10px',
    textAlign: 'center',
  },
  guardNote: {
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    paddingLeft: '10px',
  },
});

export function TrainingStatsPage() {
  const { t, locale } = useLocale();
  const bridge = useMemo(() => getTrainerBridge(), []);
  const [stats, setStats] = useState<TrainerStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.stats().then((result) => {
      if (!active) return;
      if (result.ok) setStats(result.data);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [bridge]);

  if (!bridge)
    return (
      <div className={`trainer-order-error ${stylex.props(styles.orderError).className}`}>
        {t('trainingDesktopOnly')}
      </div>
    );
  if (error)
    return (
      <div className={`trainer-order-error ${stylex.props(styles.orderError).className}`}>
        {error}
      </div>
    );
  if (!stats)
    return (
      <div className={`trainer-order-panel--status ${stylex.props(styles.orderStatus).className}`}>
        {t('calculatingStats')}
      </div>
    );

  const periods = Object.entries(stats.sessionsByBasePeriod)
    .map(([period, count]) => `${period} ${count}`)
    .join(' / ');

  return (
    <div className={`training-stats ${stylex.props(styles.root).className}`}>
      <SectionTitle>
        {t('trainingStats')}
        <Link className={`training-stats-back ${stylex.props(styles.back).className}`} to="/">
          ← {t('backHome')}
        </Link>
      </SectionTitle>
      <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
        {t('completedSessions', { count: stats.completedSessions })}
        {periods && ` · ${periods}`}
        {stats.unfinishedSessions > 0 &&
          ` · ${t('unfinishedSessions', { count: stats.unfinishedSessions })}`}
      </p>

      <Card className="training-stats-overview">
        <Guard block={stats.overview} unit={t('completedUnit')}>
          <div className={`trainer-review-figs ${stylex.props(styles.figures).className}`}>
            <Figure label={t('netR')} value={signed(stats.overview.netR)} />
            <Figure label={t('winRate')} value={pct(stats.overview.winRate)} />
            <Figure
              label={t('plannedVsRealized')}
              value={`${fmt(stats.overview.plannedRewardRisk ?? 0)} → ${fmt(stats.overview.realizedRewardRisk ?? 0)}`}
              hint={t('plannedVsRealizedHint')}
            />
            <Figure label={t('mfeGiveback')} value={pct(stats.overview.mfeGivebackRate)} />
          </div>
        </Guard>
      </Card>

      <div className={`training-stats-grid ${stylex.props(styles.grid).className}`}>
        <Card>
          <h4>{t('byStructureTag')}</h4>
          {stats.byTag.length === 0 && (
            <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
              {t('noCompletedSessions')}
            </p>
          )}
          {stats.byTag.map((row) => (
            <div
              className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}
              key={row.tag ?? 'untagged'}
            >
              <span>{row.tag ? trainerCaseTagLabel(row.tag, locale) : t('untagged')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {row.locked
                  ? t('insufficientSessionSamples', { count: row.samples })
                  : `${signed(row.netR)}R · ${pct(row.winRate)}`}
              </b>
            </div>
          ))}
        </Card>

        <Card>
          <h4>{t('stopHealth')}</h4>
          <Guard block={stats.stopHealth} unit={t('stoppedOutUnit')}>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('reachedTargetAfterStop')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.stopHealth.reachedTargetAfterStopRate)}
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('averageStopOvershoot')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {fmt(stats.stopHealth.averageOvershootPct ?? 0)}%
              </b>
            </div>
          </Guard>
          <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
            {t('stopHealthHint')}
          </p>
        </Card>

        <Card>
          <h4>{t('coachInfluence')}</h4>
          <Guard block={stats.coachInfluence} unit={t('disagreementCalls')}>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('persuaded')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {t('rateWithCalls', {
                  rate: pct(stats.coachInfluence.persuadedWinRate),
                  count: stats.coachInfluence.persuadedCount,
                })}
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('heldOwnView')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {t('rateWithCalls', {
                  rate: pct(stats.coachInfluence.heldWinRate),
                  count: stats.coachInfluence.heldCount,
                })}
              </b>
            </div>
          </Guard>
          <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
            {t('coachInfluenceHint')}
          </p>
        </Card>

        <Card>
          <h4>{t('advanceInfluence')}</h4>
          <Guard block={stats.advanceStyle} unit={t('filledTrades')}>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('barByBarHolding')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.advanceStyle.barByBarWinRate)}
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('fastForwardHolding')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.advanceStyle.fastForwardWinRate)}
              </b>
            </div>
          </Guard>
          <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
            {t('advanceInfluenceHint')}
          </p>
        </Card>

        <Card>
          <h4>{t('coachScorecard')}</h4>
          <Guard block={stats.coachScorecard} unit={t('calls')}>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('directionAccuracy')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {t('rateWithOutcomes', {
                  rate: pct(stats.coachScorecard.directionAccuracy),
                  count: stats.coachScorecard.settled,
                })}
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('soundReasonRate')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.coachScorecard.soundReasonRate)}
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>{t('rightCallWrongReason')}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.coachScorecard.rightCallWrongReasonRate)}
              </b>
            </div>
          </Guard>
          <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
            {t('coachReasonHint')}
          </p>
        </Card>
      </div>

      <p
        className={`trainer-settle-hint training-stats-guard-note ${stylex.props(styles.settleHint, styles.guardNote).className}`}
      >
        {t('trainingSampleGuardHint')}
      </p>
    </div>
  );
}

/**
 * A locked block says how many samples it has and stops. It does not render a zero, a dash in
 * place of a ratio, or a bar at 0% — each of those reads as a measurement, and there isn't one.
 */
function Guard({
  block,
  unit,
  children,
}: {
  block: TrainerStatBlock;
  unit: string;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  if (!block.locked) return <>{children}</>;
  return (
    <div
      className={`training-stats-locked ${stylex.props(styles.locked).className}`}
      data-testid="training-stats-locked"
    >
      {t('trainingSampleCount', { count: block.samples, unit })}
      <br />
      {t('tooFewSamples')}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <figure className={`trainer-fig ${stylex.props(styles.figure).className}`}>
      <figcaption className={stylex.props(styles.figureCaption).className}>{label}</figcaption>
      <div className={`num trainer-fig-val ${stylex.props(styles.figureValue).className}`}>
        {value}
      </div>
      {hint && (
        <div className={`trainer-fig-sub ${stylex.props(styles.figureSub).className}`}>{hint}</div>
      )}
    </figure>
  );
}
