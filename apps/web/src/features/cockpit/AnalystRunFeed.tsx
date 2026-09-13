import { type MessageKey } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import type {
  AnalystActivity,
  ContextSection,
  ReassessPhase,
  TechnicalSection,
} from '@kansoku/core/contract/symbols';
import * as stylex from '@stylexjs/stylex';
import { money } from '@web/lib/format';
import { marketOfSymbol } from '@web/lib/market';
import { Badge, Card, Dot, Empty, ErrorBox, MarketTime, SectionTitle } from '@web/ui';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import { PHASE_LABEL } from './AnalysisRunDetails';
import { useAnalystRunLastEnded, useAnalystRunStatus } from './analystRunsStore';

const TIMEFRAME_LABEL: Record<string, MessageKey> = {
  '1m': 'cockpitTf1m',
  m5: 'cockpitTf5m',
  m15: 'cockpitTf15m',
  '30m': 'cockpitTf30m',
  h1: 'cockpitTf1h',
  '4h': 'cockpitTf4h',
  day: 'cockpitTfDay',
  week: 'cockpitTfWeek',
  month: 'cockpitTfMonth',
};

const TREND_LABEL: Record<string, MessageKey> = {
  up: 'cockpitTrendUp',
  down: 'cockpitTrendDown',
  sideways: 'cockpitTrendSideways',
};

const BIAS_LABEL: Record<string, MessageKey> = {
  bullish: 'cockpitBiasBullish',
  bearish: 'cockpitBiasBearish',
  neutral: 'cockpitBiasNeutral',
};

const BIAS_TONE: Record<string, 'up' | 'down' | 'muted'> = {
  bullish: 'up',
  bearish: 'down',
  neutral: 'muted',
};

const ACTIVITY_LIMIT = 8;

const shimmer = stylex.keyframes({
  from: { backgroundPosition: '100% 0' },
  to: { backgroundPosition: '-100% 0' },
});

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '12px',
  },
  banner: { margin: 0 },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  cardHeadTitle: { marginTop: 0 },
  midBadge: {
    flex: '0 0 auto',
    cursor: 'help',
  },
  trends: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '6px',
  },
  trendChip: { cursor: 'default' },
  levels: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '8px',
  },
  level: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    fontSize: fontSizes.sm,
  },
  levelPrice: {
    color: colors.textPrimary,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  levelLabel: { color: colors.textSecondary },
  summary: {
    margin: '8px 0 0',
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.5,
  },
  biasBadge: { marginTop: '2px' },
  skeleton: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '6px',
  },
  skeletonBone: {
    'animationDuration': '1.5s',
    'animationIterationCount': 'infinite',
    'animationName': shimmer,
    'animationTimingFunction': 'ease-in-out',
    'backgroundImage': `linear-gradient(90deg, ${colors.backgroundElement} 0%, ${colors.backgroundHover} 45%, ${colors.backgroundElement} 90%)`,
    'backgroundSize': '200% 100%',
    'borderRadius': radii.lg,
    'height': '13px',
    'width': '100%',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      backgroundColor: colors.backgroundElement,
      backgroundImage: 'none',
    },
  },
  skeletonBoneR1: { width: '80%' },
  skeletonBoneR2: { width: '55%' },
  feedSection: { marginTop: '4px' },
  feedPhase: {
    marginBottom: '6px',
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  feedList: {
    display: 'flex',
    flexDirection: 'column',
  },
  feedItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    padding: '6px 2px',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  feedDot: { flex: '0 0 auto' },
  feedDotStatic: {
    flex: '0 0 auto',
    width: '6px',
    height: '6px',
    borderRadius: radii.full,
    backgroundColor: colors.borderStrong,
    display: 'inline-block',
  },
  feedTime: {
    flex: '0 0 auto',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  feedText: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    lineHeight: 1.45,
  },
});

function MidReadBadge() {
  const { t: i18n } = useLocale();
  return (
    <Badge
      tone="muted"
      className={stylex.props(styles.midBadge).className}
      title={i18n('cockpitPreliminaryHelp')}
    >
      {i18n('cockpitPreliminary')}
    </Badge>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div
      className={`analyst-run-skeleton ${stylex.props(styles.skeleton).className}`}
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`app-skeleton-bone ${
            stylex.props(
              styles.skeletonBone,
              i % 3 === 1 && styles.skeletonBoneR1,
              i % 3 === 2 && styles.skeletonBoneR2,
            ).className
          }`}
        />
      ))}
    </div>
  );
}

function TechnicalCard({ section }: { section: TechnicalSection | undefined }) {
  const { t: i18n } = useLocale();
  return (
    <Card className="analyst-run-card--technical">
      <div {...stylex.props(styles.cardHead)}>
        <SectionTitle className={stylex.props(styles.cardHeadTitle).className}>
          {i18n('cockpitTechnical')}
        </SectionTitle>
        <MidReadBadge />
      </div>
      {section ? (
        <>
          {section.trends.length > 0 && (
            <div {...stylex.props(styles.trends)}>
              {section.trends.map((t) => (
                <span
                  key={t.timeframe}
                  className={`chip ${stylex.props(styles.trendChip).className}`}
                >
                  {TIMEFRAME_LABEL[t.timeframe] ? i18n(TIMEFRAME_LABEL[t.timeframe]) : t.timeframe}{' '}
                  · {TREND_LABEL[t.trend] ? i18n(TREND_LABEL[t.trend]) : t.trend}
                </span>
              ))}
            </div>
          )}
          {section.levels.length > 0 && (
            <div {...stylex.props(styles.levels)}>
              {section.levels.map((lvl, i) => (
                <div key={i} {...stylex.props(styles.level)}>
                  <span {...stylex.props(styles.levelPrice)}>{money(lvl.price)}</span>
                  <span {...stylex.props(styles.levelLabel)}>{lvl.label}</span>
                </div>
              ))}
            </div>
          )}
          {section.summary && <p {...stylex.props(styles.summary)}>{section.summary}</p>}
        </>
      ) : (
        <CardSkeleton rows={3} />
      )}
    </Card>
  );
}

function ContextCard({ section }: { section: ContextSection | undefined }) {
  const { t: i18n } = useLocale();
  return (
    <Card className="analyst-run-card--context">
      <div {...stylex.props(styles.cardHead)}>
        <SectionTitle className={stylex.props(styles.cardHeadTitle).className}>
          {i18n('cockpitContext')}
        </SectionTitle>
        <MidReadBadge />
      </div>
      {section ? (
        <>
          <Badge
            tone={BIAS_TONE[section.bias]}
            className={stylex.props(styles.biasBadge).className}
          >
            {BIAS_LABEL[section.bias] ? i18n(BIAS_LABEL[section.bias]) : section.bias}
          </Badge>
          {section.summary && <p {...stylex.props(styles.summary)}>{section.summary}</p>}
        </>
      ) : (
        <CardSkeleton rows={2} />
      )}
    </Card>
  );
}

function ActivityFeed({
  sym,
  activities,
  running,
  phase,
  activity,
}: {
  sym: string;
  activities: AnalystActivity[];
  running: boolean;
  phase?: ReassessPhase;
  activity?: string;
}) {
  const { t: i18n } = useLocale();
  const market = marketOfSymbol(sym);
  const visible = activities.slice().reverse().slice(0, ACTIVITY_LIMIT);

  return (
    <div {...stylex.props(styles.feedSection)}>
      <SectionTitle>{i18n('cockpitProgress')}</SectionTitle>
      {running && activity && (
        <div {...stylex.props(styles.feedPhase)}>
          {phase && <span>{i18n(PHASE_LABEL[phase])} · </span>}
          <span>{activity}</span>
        </div>
      )}
      {visible.length === 0 ? (
        <Empty>{i18n('cockpitNoActivity')}</Empty>
      ) : (
        <div {...stylex.props(styles.feedList)}>
          {visible.map((entry, i) => (
            <div
              key={`${entry.at}-${i}`}
              className={`analyst-run-feed-item ${stylex.props(styles.feedItem).className}`}
            >
              {i === 0 && running ? (
                <Dot tone="accent" pulse className={stylex.props(styles.feedDot).className} />
              ) : (
                <span className={stylex.props(styles.feedDotStatic).className} aria-hidden="true" />
              )}
              <MarketTime
                className={stylex.props(styles.feedTime).className}
                value={entry.at}
                format="clock"
                market={market}
              />
              <span {...stylex.props(styles.feedText)}>{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnalystRunFeed({ sym }: { sym: string }) {
  const { t: i18n } = useLocale();
  const status = useAnalystRunStatus(sym);
  const lastEnded = useAnalystRunLastEnded(sym);
  const source = status ?? lastEnded;
  if (!source) return null;

  const running = status !== null;
  const activities = source.activities ?? [];
  const sections = source.sections ?? {};

  return (
    <div className={`analyst-run-feed ${stylex.props(styles.root).className}`}>
      {!running && (
        <ErrorBox {...stylex.props(styles.banner)}>{i18n('cockpitIncomplete')}</ErrorBox>
      )}
      <TechnicalCard section={sections.technical} />
      <ContextCard section={sections.context} />
      <ActivityFeed
        sym={sym}
        activities={activities}
        running={running}
        phase={status?.phase}
        activity={status?.activity}
      />
    </div>
  );
}
