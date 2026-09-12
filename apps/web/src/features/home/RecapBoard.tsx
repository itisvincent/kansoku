import type { MessageKey } from '../../lib/i18n';
import { tradeDirectionLabel } from '../../lib/marketLabels';
import { useLocale } from '../../lib/i18n';
import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { OverviewRecap, PredictionStats, StatsBucket } from '@kansoku/shared/types';
import { signed } from '@web/lib/format';
import { symbolAnalysisPath } from '@kansoku/shared/chartUrl';
import { marketDate } from '@kansoku/shared/time';
import { client } from '@web/lib/client';
import { Badge, Card, ErrorBox, MarketTime, NoteBlock, Num, SectionTitle } from '@web/ui';
import { useIntervalFetch } from '../cockpit/useIntervalFetch';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  board: {
    marginTop: '4px',
  },
  toggle: {
    cursor: 'pointer',
    userSelect: 'none',
  },
  subhead: {
    marginTop: '16px',
  },
  settlements: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '8px',
  },
  row: {
    alignItems: 'center',
    display: 'grid',
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
    gap: '10px',
    gridTemplateColumns: '60px 48px 1fr auto',
  },
  rowSymbol: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  rowDirection: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
  },
  statsSpaced: {
    marginTop: '8px',
  },
  overviewStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  statsLine: {
    alignItems: 'baseline',
    display: 'flex',
    fontSize: fontSizes.base,
    gap: '12px',
  },
  statsLineKey: {
    color: colors.textSecondary,
    minWidth: '88px',
  },
  statsLineValue: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  ai: {
    marginTop: '8px',
  },
  alerts: {
    alignItems: 'baseline',
    columnGap: '12px',
    display: 'grid',
    gridTemplateColumns: 'max-content max-content minmax(0, 1fr)',
    rowGap: '10px',
  },
  alert: {
    color: colors.textSecondary,
    display: 'contents',
    fontSize: fontSizes.base,
  },
  alertTime: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  alertSymbol: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: 600,
  },
  alertText: {
    lineHeight: 1.6,
    textWrap: 'pretty',
  },
  icon: {
    verticalAlign: '-2px',
  },
});

const OUTCOME_LABEL: Record<string, MessageKey> = {
  hit_target: 'homeOutcomeTarget',
  hit_stop: 'homeOutcomeStop',
  held_range: 'homeOutcomeHeld',
  broke_range: 'homeOutcomeBroken',
  open: 'homeOutcomeOpen',
};
const OUTCOME_TONE: Record<string, 'up' | 'down'> = {
  hit_target: 'up',
  hit_stop: 'down',
  held_range: 'up',
  broke_range: 'down',
};

function BucketLine({ label, bucket }: { label: string; bucket: StatsBucket }) {
  const { t: i18n } = useLocale();
  const ranged = (bucket.held_range ?? 0) + (bucket.broke_range ?? 0);
  const resolved = bucket.hit_target + bucket.hit_stop + ranged;
  return (
    <div {...stylex.props(styles.statsLine)}>
      <span {...stylex.props(styles.statsLineKey)}>{label}</span>
      <span {...stylex.props(styles.statsLineValue)}>
        {i18n('homePredictionCountRate', {
          count: bucket.total,
          rate: bucket.win_rate == null ? '—' : `${(bucket.win_rate * 100).toFixed(0)}%`,
        })}
        {resolved > 0 &&
          i18n('homePredictionOutcomes', {
            targets: bucket.hit_target,
            stops: bucket.hit_stop,
            ranges:
              ranged > 0
                ? i18n('homePredictionRanges', {
                    held: bucket.held_range ?? 0,
                    broken: bucket.broke_range ?? 0,
                  })
                : '',
          })}
        {bucket.open > 0 && i18n('homeOpenPredictions', { count: bucket.open })}
        {bucket.avg_pct != null && i18n('homeAvgResolvedReturn', { value: signed(bucket.avg_pct) })}
        {bucket.avg_r != null && i18n('homeAvgProfitLoss', { value: signed(bucket.avg_r) })}
      </span>
    </div>
  );
}

function StatsBlock({ stats }: { stats: PredictionStats | null }) {
  const { t: i18n } = useLocale();
  if (!stats) return <NoteBlock>{i18n('homeStatisticsLoading')}</NoteBlock>;
  if (stats.total === 0) return <NoteBlock>{i18n('homeNoPredictionsForStats')}</NoteBlock>;
  return (
    <div {...stylex.props(styles.overviewStats)}>
      <BucketLine label={i18n('homeAllPredictions')} bucket={stats.overall} />
      <BucketLine label={i18n('homeLongDirection')} bucket={stats.by_direction.long} />
      <BucketLine label={i18n('homeShortDirection')} bucket={stats.by_direction.short} />
      <BucketLine label={i18n('homeWaitDirection')} bucket={stats.by_direction.neutral} />
      <BucketLine label={i18n('homeAiGenerated')} bucket={stats.by_origin.analyst} />
      <BucketLine label={i18n('homeManualAnalysis')} bucket={stats.by_origin.manual} />
    </div>
  );
}

function SettlementTable({ recap, emptyLabel }: { recap: OverviewRecap; emptyLabel: string }) {
  const { t: i18n, locale } = useLocale();
  if (recap.settlements.length === 0) return <NoteBlock>{emptyLabel}</NoteBlock>;
  return (
    <div {...stylex.props(styles.settlements)}>
      {recap.settlements.map((s) => (
        <Card
          link
          key={s.symbol}
          {...stylex.props(styles.row)}
          href={symbolAnalysisPath(s.symbol, s.chart_id)}
        >
          <span {...stylex.props(styles.rowSymbol)}>{s.symbol.replace(/\.US$/, '')}</span>
          <span {...stylex.props(styles.rowDirection)}>
            {s.direction ? tradeDirectionLabel(s.direction, locale) : '—'}
          </span>
          {s.day_pct != null ? <Num value={s.day_pct} diff suffix="%" /> : <span>—</span>}
          {s.outcome ? (
            <Badge tone={OUTCOME_TONE[s.outcome.status]}>
              {i18n(OUTCOME_LABEL[s.outcome.status])}
            </Badge>
          ) : (
            <Badge>{i18n('homeUndetermined')}</Badge>
          )}
        </Card>
      ))}
    </div>
  );
}

function AiActivity({
  recap,
  costLabel,
  emptyLabel,
}: {
  recap: OverviewRecap;
  costLabel: string;
  emptyLabel: string;
}) {
  const { t: i18n, locale } = useLocale();
  const usage = recap.usage;
  return (
    <div {...stylex.props(styles.ai)}>
      {recap.alerts.length === 0 && <NoteBlock>{emptyLabel}</NoteBlock>}
      {recap.alerts.length > 0 && (
        <div {...stylex.props(styles.alerts)}>
          {recap.alerts.map((a, i) => (
            <div key={i} {...stylex.props(styles.alert)}>
              <MarketTime {...stylex.props(styles.alertTime)} value={a.ts} format="clock" />
              <span {...stylex.props(styles.alertSymbol)}>{a.symbol.replace(/\.US$/, '')}</span>
              <span {...stylex.props(styles.alertText)}>{a.text}</span>
            </div>
          ))}
        </div>
      )}
      <div {...stylex.props(styles.statsLine, styles.statsSpaced)}>
        <span {...stylex.props(styles.statsLineKey)}>{costLabel}</span>
        <span {...stylex.props(styles.statsLineValue)}>
          {usage.runs === 0
            ? i18n('homeNoRecordsYet')
            : i18n('homeAiUsage', {
                cost: usage.cost_total.toFixed(4),
                runs: usage.runs,
                tokens: usage.total_tokens.toLocaleString(locale),
              })}
        </span>
      </div>
    </div>
  );
}

export function RecapBoard({ date, defaultExpanded }: { date: string; defaultExpanded: boolean }) {
  const { t: i18n } = useLocale();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isToday = date === marketDate();
  const { data: recap, error } = useIntervalFetch<OverviewRecap>(
    expanded ? `overview.recap:${date}` : null,
    () => client.overview.recap({ date }),
    isToday ? 5 * 60_000 : null,
  );
  const { data: stats } = useIntervalFetch<PredictionStats>(
    expanded ? 'overview.stats' : null,
    () => client.overview.stats(),
    5 * 60_000,
  );

  const title = isToday ? i18n('homeTodayRecap') : i18n('homeRecapDate', { date: date.slice(5) });
  const costLabel = isToday ? i18n('homeTodayAiCost') : i18n('homeDayAiCost');
  const emptySettlements = isToday
    ? i18n('homeNoTrackedSymbolsToday')
    : i18n('homeNoTrackedSymbolsThatDay');
  const emptyAlerts = isToday ? i18n('homeNoAlertsToday') : i18n('homeNoAlertsThatDay');

  return (
    <div {...stylex.props(styles.board)}>
      <SectionTitle
        className={stylex.props(styles.toggle).className}
        onClick={() => setExpanded(!expanded)}
      >
        {title}{' '}
        {expanded ? (
          <ChevronDown className={`icon ${stylex.props(styles.icon).className}`} size={13} />
        ) : (
          <ChevronRight className={`icon ${stylex.props(styles.icon).className}`} size={13} />
        )}
      </SectionTitle>
      {expanded && (
        <>
          {error && <ErrorBox>{error}</ErrorBox>}
          {!recap && !error && <NoteBlock>{i18n('homeRecapLoading')}</NoteBlock>}
          {recap && (
            <>
              <SettlementTable recap={recap} emptyLabel={emptySettlements} />
              <SectionTitle className={stylex.props(styles.subhead).className}>
                {i18n('homeAllTimePredictionResults')}
              </SectionTitle>
              <StatsBlock stats={stats} />
              <SectionTitle className={stylex.props(styles.subhead).className}>
                {i18n('homeAiActivity')}
              </SectionTitle>
              <AiActivity recap={recap} costLabel={costLabel} emptyLabel={emptyAlerts} />
            </>
          )}
        </>
      )}
    </div>
  );
}
