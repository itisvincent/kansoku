import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { PlanBoard, PlanBoardPlan, QuoteSnapshot } from '@kansoku/shared/types';
import type { NextLevel } from '@kansoku/shared/planLevels';
import { symbolAnalysisPath } from '@kansoku/shared/chartUrl';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { money, signed } from '@web/lib/format';
import { useLocale } from '@web/lib/i18n';
import { useTitle } from '@web/lib/useTitle';
import { useWsChannel } from '@web/lib/ws/useWsChannel';
import { Badge, Card, ErrorBox, MarketTime, NoteBlock, SectionTitle, Spinner } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { boardRows, NEAR_LEVEL_PCT, type BoardRow } from './planBoardRows';

const REFRESH_MS = 60_000;

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    margin: '0 auto',
    maxWidth: '1100px',
    padding: '16px',
  },
  back: {
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'marginLeft': '10px',
    'textDecoration': 'none',
    ':hover': { color: colors.accent },
  },
  intro: { color: colors.textSecondary, fontSize: fontSizes.sm, lineHeight: 1.6, margin: 0 },
  summary: { color: colors.textSecondary, fontSize: fontSizes.sm },
  scroll: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', fontSize: fontSizes.sm, width: '100%' },
  head: {
    color: colors.textSecondary,
    fontWeight: 500,
    padding: '6px 8px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  headNum: { textAlign: 'right' },
  row: { borderTopColor: colors.border, borderTopStyle: 'solid', borderTopWidth: '1px' },
  rowNear: { backgroundColor: `color-mix(in srgb, ${colors.accent} 6%, transparent)` },
  cell: { padding: '7px 8px', verticalAlign: 'top' },
  num: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  symbol: {
    'color': colors.textPrimary,
    'fontWeight': 600,
    'textDecoration': 'none',
    ':hover': { color: colors.accent },
  },
  sub: { color: colors.textMuted, display: 'block', fontSize: '11px', marginTop: '2px' },
  level: { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  up: { color: colors.up },
  down: { color: colors.down },
  muted: { color: colors.textMuted },
});

function shortSymbol(symbol: string): string {
  return symbol.replace(/\.US$/, '');
}

/** Prices in the holding's own currency. */
function priceText(symbol: string, value: number, digits = 2): string {
  const amount = money(value, digits).slice(1);
  if (symbol.endsWith('.HK')) return 'HK$' + amount;
  if (/\.(SH|SZ)$/.test(symbol)) return '¥' + amount;
  return '$' + amount;
}

function LevelCell({
  level,
  kind,
  symbol,
  stopBroken = false,
}: {
  level: NextLevel | null;
  kind: 'buy' | 'sell';
  symbol: string;
  stopBroken?: boolean;
}) {
  const { t } = useLocale();
  if (!level) return <span className={stylex.props(styles.muted).className}>—</span>;
  if (stopBroken) {
    return (
      <span className={stylex.props(styles.level, styles.muted).className} title={level.note}>
        <Badge tone="down">{t('plansStopBroken')}</Badge> {level.label} {priceText(symbol, level.price)}
      </span>
    );
  }
  return (
    <span className={stylex.props(styles.level).className} title={level.note}>
      {level.reached && (
        <Badge tone={kind === 'buy' ? 'up' : 'down'}>
          {t(kind === 'buy' ? 'plansInAddZone' : 'plansInTrimZone')}
        </Badge>
      )}{' '}
      {level.label} {priceText(symbol, level.price)}
      <span
        className={
          stylex.props(styles.sub, !level.reached && (kind === 'buy' ? styles.down : styles.up))
            .className
        }
      >
        {level.reached ? t('plansReached') : `${signed(level.distance_pct, 1)}%`}
      </span>
    </span>
  );
}

function PlanCell({ plan, symbol }: { plan: PlanBoardPlan | null; symbol: string }) {
  const { t } = useLocale();
  if (!plan) {
    return (
      <span className={stylex.props(styles.muted).className}>
        {t('plansNoPlan')}
        <a
          className={stylex.props(styles.sub).className}
          href={symbolAnalysisPath(symbol, null)}
        >
          {t('plansRunAnalysis')}
        </a>
      </span>
    );
  }
  const freshness = plan.freshness;
  return (
    <span>
      <MarketTime value={plan.made_at} format="month-day-time" />
      {plan.anchor_year ? ` · ${plan.anchor_year}` : ''}
      {freshness.state === 'stale' && (
        <span className={stylex.props(styles.sub).className}>
          <Badge tone="down">
            {freshness.reason === 'earnings'
              ? t('plansStaleEarnings', { date: freshness.date })
              : freshness.reason === 'earnings_day'
                ? t('plansStaleEarningsDay', { date: freshness.date })
                : t('plansStaleAge', { days: freshness.days })}
          </Badge>
        </span>
      )}
      {freshness.state === 'earnings_soon' && (
        <span className={stylex.props(styles.sub).className}>
          <Badge tone="accent">
            {freshness.days === 0
              ? t('plansEarningsToday')
              : t('plansEarningsSoon', { date: freshness.date, days: freshness.days })}
          </Badge>
        </span>
      )}
    </span>
  );
}

function Targets({ plan, symbol }: { plan: PlanBoardPlan | null; symbol: string }) {
  if (!plan) return <span className={stylex.props(styles.muted).className}>—</span>;
  const { bear, base, bull } = plan.targets;
  const show = (value: number | null) => (value == null ? '—' : priceText(symbol, value, 0));
  return (
    <span className={stylex.props(styles.level).className}>
      {show(bear)} / {show(base)} / {show(bull)}
    </span>
  );
}

function BoardTable({ rows }: { rows: BoardRow[] }) {
  const { t } = useLocale();
  return (
    <div className={stylex.props(styles.scroll).className}>
      <table className={`plan-board ${stylex.props(styles.table).className}`}>
        <thead>
          <tr>
            <th className={stylex.props(styles.head).className}>{t('plansStock')}</th>
            <th className={stylex.props(styles.head, styles.headNum).className}>
              {t('plansPrice')}
            </th>
            <th className={stylex.props(styles.head).className}>{t('plansNextAdd')}</th>
            <th className={stylex.props(styles.head).className}>{t('plansNextTrim')}</th>
            <th className={stylex.props(styles.head).className}>{t('plansStop')}</th>
            <th className={stylex.props(styles.head).className}>{t('plansTargets')}</th>
            <th className={stylex.props(styles.head).className}>{t('plansMade')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.symbol}
              className={`plan-board-row ${stylex.props(styles.row, row.near && styles.rowNear).className}`}
              data-near={row.near ? 'true' : undefined}
            >
              <td className={stylex.props(styles.cell).className}>
                <a
                  className={stylex.props(styles.symbol).className}
                  href={symbolAnalysisPath(row.symbol, row.plan?.chart_id ?? null)}
                >
                  {shortSymbol(row.symbol)}
                </a>
                <span className={stylex.props(styles.sub).className}>{row.name}</span>
              </td>
              <td className={stylex.props(styles.cell, styles.num).className}>
                {row.price == null ? '—' : priceText(row.symbol, row.price)}
              </td>
              <td className={stylex.props(styles.cell).className}>
                <LevelCell
                  level={row.nextBuy}
                  kind="buy"
                  symbol={row.symbol}
                  stopBroken={row.stopBroken}
                />
              </td>
              <td className={stylex.props(styles.cell).className}>
                <LevelCell level={row.nextSell} kind="sell" symbol={row.symbol} />
              </td>
              <td className={stylex.props(styles.cell).className}>
                {row.stop ? (
                  <span className={stylex.props(styles.level).className}>
                    {priceText(row.symbol, row.stop.price)}
                    <span className={stylex.props(styles.sub).className}>
                      {row.stop.reached ? t('plansBelowStop') : `${signed(row.stop.distance_pct, 1)}%`}
                    </span>
                  </span>
                ) : (
                  <span className={stylex.props(styles.muted).className}>—</span>
                )}
              </td>
              <td className={stylex.props(styles.cell).className}>
                <Targets plan={row.plan} symbol={row.symbol} />
              </td>
              <td className={stylex.props(styles.cell).className}>
                <PlanCell plan={row.plan} symbol={row.symbol} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlanBoardPage() {
  const { t } = useLocale();
  useTitle(t('plansTitle'));
  const query = usePollingQuery<PlanBoard>(
    'positions.plans',
    () => client.positions.plans(),
    REFRESH_MS,
  );
  const symbols = useMemo(
    () => (query.data?.rows ?? []).map((row) => row.symbol).sort(),
    [query.data],
  );
  const [live, setLive] = useState<Record<string, number>>({});
  useWsChannel<QuoteSnapshot>(symbols.length ? { kind: 'quotes', extra: symbols } : null, (snap) =>
    setLive(Object.fromEntries(snap.quotes.map((quote) => [quote.symbol, quote.last]))),
  );
  const rows = useMemo(() => boardRows(query.data?.rows ?? [], live), [query.data, live]);
  const planned = rows.filter((row) => row.plan).length;
  const near = rows.filter((row) => row.near).length;
  const stale = rows.filter((row) => row.plan?.freshness.state === 'stale').length;

  return (
    <div className={`plan-board-page ${stylex.props(styles.root).className}`}>
      <SectionTitle>
        {t('plansTitle')}
        <a className={stylex.props(styles.back).className} href="/">
          ← {t('backHome')}
        </a>
      </SectionTitle>
      <p className={stylex.props(styles.intro).className}>{t('plansIntro')}</p>
      {query.data ? (
        <>
          {query.error && <ErrorBox>{query.error}</ErrorBox>}
          <span className={stylex.props(styles.summary).className}>
            {t('plansSummary', {
              total: rows.length,
              planned,
              near,
              pct: NEAR_LEVEL_PCT,
            })}
            {stale > 0 ? ` · ${t('plansSummaryStale', { count: stale })}` : ''}
          </span>
          {rows.length === 0 ? (
            <NoteBlock>{t('plansEmpty')}</NoteBlock>
          ) : (
            <Card>
              <BoardTable rows={rows} />
            </Card>
          )}
        </>
      ) : query.error ? (
        <ErrorBox>{query.error}</ErrorBox>
      ) : (
        <NoteBlock>
          <Spinner />
        </NoteBlock>
      )}
    </div>
  );
}
