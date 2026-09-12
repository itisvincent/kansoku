import { type MessageKey } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import * as stylex from '@stylexjs/stylex';
import { Check, CircleX, Clock, NotebookText } from 'lucide-react';
import type { OutcomeStatus, SymbolAnalysisRow } from '@kansoku/shared/types';
import { marketDate } from '@kansoku/shared/time';
import { fmt, signed } from '@web/lib/format';
import { marketOfSymbol } from '@web/lib/market';
import { symbolUrl } from './analysisMode';
import { tradeDirectionLabel } from '@web/lib/marketLabels';
import { Badge, MarketTime, SectionTitle } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  item: {
    'display': 'block',
    'padding': '8px 10px',
    'marginBottom': '6px',
    'backgroundColor': colors.backgroundSurface,
    'borderLeftStyle': 'solid',
    'borderLeftWidth': '3px',
    ':hover': {
      textDecoration: 'none',
      backgroundColor: colors.backgroundHover,
    },
  },
  itemLong: {
    borderLeftColor: colors.up,
  },
  itemShort: {
    borderLeftColor: colors.down,
  },
  itemNeutral: {
    borderLeftColor: colors.textSecondary,
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  range: {
    fontSize: fontSizes.control,
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  meta: {
    fontSize: fontSizes.control,
    color: colors.textSecondary,
    marginTop: '3px',
    lineHeight: 1.45,
  },
  linkButton: {
    'backgroundColor': 'transparent',
    'border': 'none',
    'padding': 0,
    'color': colors.accent,
    'fontSize': 'inherit',
    'cursor': 'pointer',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  icon: {
    verticalAlign: '-2px',
  },
  outcomeUp: {
    color: colors.up,
  },
  outcomeDown: {
    color: colors.down,
  },
});

const OUTCOME_LABEL: Record<
  OutcomeStatus,
  { icon: typeof Check; tone: string; label: MessageKey }
> = {
  hit_target: { icon: Check, tone: 'up', label: 'cockpitOutcomeTarget' },
  hit_stop: { icon: CircleX, tone: 'down', label: 'cockpitOutcomeStop' },
  held_range: { icon: Check, tone: 'up', label: 'cockpitOutcomeHeld' },
  broke_range: { icon: CircleX, tone: 'down', label: 'cockpitOutcomeBroke' },
  open: { icon: Clock, tone: '', label: 'cockpitOutcomeOpen' },
};

function OutcomeText({ status }: { status: OutcomeStatus }) {
  const { t: i18n } = useLocale();
  const { icon: Icon, tone, label } = OUTCOME_LABEL[status];
  const toneStyleClassName = stylex.props(
    tone === 'up' && styles.outcomeUp,
    tone === 'down' && styles.outcomeDown,
  ).className;
  return (
    <span className={toneStyleClassName}>
      <Icon className={`icon ${stylex.props(styles.icon).className}`} size={13} /> {i18n(label)}
    </span>
  );
}

interface HistoryTabProps {
  symbol: string;
  rows: SymbolAnalysisRow[];
  currentId: string | null;
  journalByDate?: Map<string, string>;
  onOpenJournal?: (name: string) => void;
}

export function HistoryTab({
  symbol,
  rows,
  currentId,
  journalByDate,
  onOpenJournal,
}: HistoryTabProps) {
  const { t: i18n, locale } = useLocale();
  const market = marketOfSymbol(symbol);
  const journalFor = (row: SymbolAnalysisRow): string | undefined =>
    journalByDate?.get(marketDate(row.created_at));
  return (
    <>
      <SectionTitle>{i18n('cockpitHistory')}</SectionTitle>
      {rows.map((row) => (
        <a
          key={row.id}
          className={`zone-item ${
            stylex.props(
              styles.item,
              row.direction === 'long'
                ? styles.itemLong
                : row.direction === 'short'
                  ? styles.itemShort
                  : styles.itemNeutral,
            ).className
          }`}
          href={symbolUrl(symbol, row.id)}
        >
          <div className={`zone-head ${stylex.props(styles.head).className}`}>
            <span className={`zone-label plain ${stylex.props(styles.label).className}`}>
              <MarketTime value={row.created_at} market={market} />
              {row.id === currentId && (
                <Badge tone="up" className="p123-badge">
                  {i18n('cockpitCurrent')}
                </Badge>
              )}
            </span>
            <span className={`zone-range ${stylex.props(styles.range).className}`}>
              {row.direction ? tradeDirectionLabel(row.direction, locale) : '—'}
            </span>
          </div>
          <div className={`zone-meta md ${stylex.props(styles.meta).className}`}>
            {row.anchor
              ? i18n('cockpitAnchor', { price: fmt(row.anchor.price) })
              : i18n('cockpitNoAnchor')}
            {' · '}
            {row.outcome ? <OutcomeText status={row.outcome.status} /> : '—'}
            {row.outcome && ` · ${signed(row.outcome.pct_since_anchor)}%`}
            {journalFor(row) && onOpenJournal && (
              <>
                {' · '}
                <button
                  className={`link-button ${stylex.props(styles.linkButton).className}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenJournal(journalFor(row)!);
                  }}
                >
                  <NotebookText
                    className={`icon ${stylex.props(styles.icon).className}`}
                    size={13}
                  />{' '}
                  {i18n('cockpitJournal')}
                </button>
              </>
            )}
          </div>
        </a>
      ))}
    </>
  );
}
