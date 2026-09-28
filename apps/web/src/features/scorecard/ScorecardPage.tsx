import { useState } from 'react';
import { Link } from 'react-router';
import * as stylex from '@stylexjs/stylex';
import type { OutcomeStatus, PredictionScorecard, ScorecardRow } from '@kansoku/shared/types';
import { symbolAnalysisPath } from '@kansoku/shared/chartUrl';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { signed } from '@web/lib/format';
import { useLocale, type MessageKey } from '@web/lib/i18n';
import { useTitle } from '@web/lib/useTitle';
import { Badge, Card, ErrorBox, MarketTime, NoteBlock, SectionTitle, SegmentedControl } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { ScorecardTable } from './ScorecardTable';
import { directionLabel, formatRate, timeframeLabel, windowsLabel } from './scorecardLabels';

type Period = '30' | '90' | 'all';
const PERIOD_KEY = 'scorecard-period';

const OUTCOME_LABEL: Record<OutcomeStatus, MessageKey> = {
  hit_target: 'homeOutcomeTarget',
  hit_stop: 'homeOutcomeStop',
  held_range: 'homeOutcomeHeld',
  broke_range: 'homeOutcomeBroken',
  open: 'homeOutcomeOpen',
};
const OUTCOME_TONE: Partial<Record<OutcomeStatus, 'up' | 'down'>> = {
  hit_target: 'up',
  held_range: 'up',
  hit_stop: 'down',
  broke_range: 'down',
};

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    margin: '0 auto',
    maxWidth: '980px',
    padding: '16px',
  },
  back: {
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'marginLeft': '10px',
    'textDecoration': 'none',
    ':hover': { color: colors.accent },
  },
  intro: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    margin: 0,
  },
  toolbar: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    justifyContent: 'space-between',
  },
  figures: {
    display: 'grid',
    gap: '8px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  },
  figure: { display: 'flex', flexDirection: 'column', gap: '3px' },
  figureLabel: { color: colors.textSecondary, fontSize: fontSizes.sm },
  figureValue: {
    fontFamily: fonts.mono,
    fontSize: '24px',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
  },
  hint: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 1.5, margin: '0 0 6px' },
  recent: { display: 'flex', flexDirection: 'column' },
  recentRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    color: 'inherit',
    display: 'grid',
    fontSize: fontSizes.sm,
    gap: '10px',
    gridTemplateColumns: 'minmax(120px, 1.2fr) 80px 70px 70px 70px minmax(110px, 1fr)',
    padding: '7px 4px',
    textDecoration: 'none',
    ':hover': { color: colors.accent },
  },
  symbol: { fontWeight: 600 },
  muted: { color: colors.textMuted },
  mono: { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' },
});

function readPeriod(): Period {
  try {
    const saved = localStorage.getItem(PERIOD_KEY);
    return saved === '30' || saved === '90' || saved === 'all' ? saved : '90';
  } catch {
    return '90';
  }
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className={stylex.props(styles.figure).className}>
      <span className={stylex.props(styles.figureLabel).className}>{label}</span>
      <span className={stylex.props(styles.figureValue).className}>{value}</span>
    </div>
  );
}

function RecentRow({ row }: { row: ScorecardRow }) {
  const { t, locale } = useLocale();
  return (
    <Link
      className={`scorecard-recent-row ${stylex.props(styles.recentRow).className}`}
      to={symbolAnalysisPath(row.symbol, row.chart_id)}
    >
      <span>
        <span className={stylex.props(styles.symbol).className}>
          {row.symbol.replace(/\.US$/, '')}
        </span>{' '}
        <span className={stylex.props(styles.muted).className}>
          <MarketTime value={row.created_at} format="date-time" />
        </span>
      </span>
      <span>{row.anchor_tf ? timeframeLabel(row.anchor_tf, locale) : '—'}</span>
      <span>{directionLabel(row.direction, locale)}</span>
      <span className={stylex.props(styles.mono).className} title={t('scorecardConviction')}>
        {row.conviction ?? '—'}
      </span>
      <span className={stylex.props(styles.mono).className}>
        {row.outcome ? signed(row.outcome.pct_since_anchor) + '%' : '—'}
      </span>
      <span>
        {row.outcome ? (
          <Badge tone={OUTCOME_TONE[row.outcome.status]}>
            {t(OUTCOME_LABEL[row.outcome.status])}
          </Badge>
        ) : (
          <Badge>{t('homeUndetermined')}</Badge>
        )}
      </span>
    </Link>
  );
}

function ScorecardBody({ card }: { card: PredictionScorecard }) {
  const { t, locale } = useLocale();
  const settled =
    card.overall.hit_target + card.overall.hit_stop + card.overall.held_range + card.overall.broke_range;
  if (card.total === 0) return <NoteBlock>{t('scorecardEmpty')}</NoteBlock>;
  return (
    <>
      <Card>
        <div className={stylex.props(styles.figures).className}>
          <Figure label={t('scorecardCalls')} value={String(card.total)} />
          <Figure label={t('scorecardSettled')} value={String(settled)} />
          <Figure label={t('scorecardWinRate')} value={formatRate(card.overall.win_rate)} />
          <Figure
            label={t('scorecardAvgR')}
            value={card.overall.avg_r == null ? '—' : signed(card.overall.avg_r)}
          />
        </div>
      </Card>

      <Card>
        <SectionTitle>{t('scorecardByAnchor')}</SectionTitle>
        <p className={stylex.props(styles.hint).className}>{t('scorecardByAnchorHint')}</p>
        <ScorecardTable groups={card.by_anchor} labelOf={(key) => timeframeLabel(key, locale)} />
      </Card>

      <Card>
        <SectionTitle>{t('scorecardByDirection')}</SectionTitle>
        <ScorecardTable groups={card.by_direction} labelOf={(key) => directionLabel(key, locale)} />
      </Card>

      <Card>
        <SectionTitle>{t('scorecardByWindows')}</SectionTitle>
        <p className={stylex.props(styles.hint).className}>{t('scorecardByWindowsHint')}</p>
        <ScorecardTable groups={card.by_windows} labelOf={(key) => windowsLabel(key, locale)} />
      </Card>

      <Card>
        <SectionTitle>{t('scorecardRecent')}</SectionTitle>
        <div className={stylex.props(styles.recent).className}>
          {card.recent.map((row) => (
            <RecentRow key={row.chart_id} row={row} />
          ))}
        </div>
      </Card>
      <p className={stylex.props(styles.hint).className}>{t('scorecardJudgeNote')}</p>
    </>
  );
}

export function ScorecardPage() {
  const { t } = useLocale();
  useTitle(t('scorecardTitle'));
  const [period, setPeriod] = useState<Period>(readPeriod);
  const days = period === 'all' ? undefined : Number(period);
  const query = useQuery(`overview.scorecard:${period}`, () =>
    client.overview.scorecard(days ? { days } : {}),
  );

  const changePeriod = (next: Period) => {
    setPeriod(next);
    try {
      localStorage.setItem(PERIOD_KEY, next);
    } catch {
      // Private windows can refuse storage; the choice just won't be remembered.
    }
  };

  return (
    <div className={`scorecard-page ${stylex.props(styles.root).className}`}>
      <SectionTitle>
        {t('scorecardTitle')}
        <Link className={stylex.props(styles.back).className} to="/">
          ← {t('backHome')}
        </Link>
      </SectionTitle>
      <p className={stylex.props(styles.intro).className}>{t('scorecardIntro')}</p>
      <div className={stylex.props(styles.toolbar).className}>
        <SegmentedControl<Period>
          ariaLabel={t('scorecardPeriod')}
          fit
          size="sm"
          value={period}
          onChange={changePeriod}
          options={[
            { value: '30', label: t('scorecardDays30') },
            { value: '90', label: t('scorecardDays90') },
            { value: 'all', label: t('scorecardAllTime') },
          ]}
        />
      </div>
      {query.error ? (
        <ErrorBox>{query.error}</ErrorBox>
      ) : query.data ? (
        <ScorecardBody card={query.data} />
      ) : (
        <NoteBlock>{t('scorecardLoading')}</NoteBlock>
      )}
    </div>
  );
}
