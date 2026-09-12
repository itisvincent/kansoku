import { tradeDirectionLabel } from '../../lib/marketLabels';
import { useLocale } from '../../lib/i18n';
import type { OverviewBoard, OverviewRow } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { fmt, signed } from '@web/lib/format';
import { Badge, Card, Dot, Empty, ErrorBox, MarketTime, NoteBlock, Num } from '@web/ui';
import { directionTone } from '@web/features/charts/intraday/directionLabels';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { FollowToggle, ReassessButton } from './SymbolActions';

const styles = stylex.create({
  watchStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  watchStripCell: {
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
    gap: '7px',
  },
  watchStripSymbol: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  overviewGrid: {
    display: 'grid',
    gap: '12px',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    marginTop: '12px',
  },
  symbolCardHead: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
  symbolCardSymbol: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  symbolCardQuote: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
  },
  symbolCardLevels: {
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
    gap: '14px',
    marginTop: '8px',
  },
  symbolCardComment: {
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    color: colors.textSecondary,
    display: '-webkit-box',
    fontSize: fontSizes.caption,
    lineHeight: 1.4,
    marginTop: '8px',
    overflow: 'hidden',
  },
  symbolCardCommentWarn: {
    color: colors.accent,
  },
  symbolCardCommentAlert: {
    color: colors.down,
  },
  unreadBadge: {
    marginLeft: '4px',
  },
});

function pctCell(value: number | null): string {
  return value == null ? '—' : `${signed(value)}%`;
}

function SymbolCard({ row }: { row: OverviewRow }) {
  const { t: i18n, locale } = useLocale();
  const comment = row.latest_comment;
  return (
    <Card link className="symbol-card" href={`/symbol/${encodeURIComponent(row.symbol)}`}>
      <div className={`symbol-card-head ${stylex.props(styles.symbolCardHead).className}`}>
        <span className={`sym ${stylex.props(styles.symbolCardSymbol).className}`}>
          {row.symbol}
        </span>
        {row.direction && (
          <Badge tone={directionTone(row.direction)}>
            {tradeDirectionLabel(row.direction, locale)}
          </Badge>
        )}
        {row.last != null && (
          <span className={`quote ${stylex.props(styles.symbolCardQuote).className}`}>
            {fmt(row.last)}
            {row.pct != null && (
              <>
                {' '}
                <Num value={row.pct} diff suffix="%" />
              </>
            )}
          </span>
        )}
        <FollowToggle symbol={row.symbol} initialFollowing={row.ai_following} />
        {row.prediction_stale && <Dot tone="accent" title={i18n('homePredictionExpired')} />}
        {row.alert_count > 0 && (
          <Badge
            tone="down"
            className={`unread-badge ${stylex.props(styles.unreadBadge).className}`}
          >
            {row.alert_count}
          </Badge>
        )}
      </div>
      <div className={`symbol-card-levels ${stylex.props(styles.symbolCardLevels).className}`}>
        <span>
          {i18n('homeStopLoss')}
          {pctCell(row.stop_distance_pct)}
        </span>
        <span>
          {i18n('homeTargetOne')}
          {pctCell(row.target1_distance_pct)}
        </span>
        {row.entry != null && (
          <span>
            {i18n('homeEntry')}
            {fmt(row.entry)}
          </span>
        )}
        <ReassessButton symbol={row.symbol} />
      </div>
      {comment && (
        <div
          className={`symbol-card-comment ${comment.level} ${
            stylex.props(
              styles.symbolCardComment,
              comment.level === 'warn' && styles.symbolCardCommentWarn,
              comment.level === 'alert' && styles.symbolCardCommentAlert,
            ).className
          }`}
        >
          <MarketTime value={comment.ts} format="clock" /> · {comment.text}
        </div>
      )}
    </Card>
  );
}

export function WatchBoard({
  board,
  error,
  compact,
}: {
  board: OverviewBoard | null;
  error: string | null;
  compact: boolean;
}) {
  const { t: i18n, locale } = useLocale();
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!board) return <NoteBlock>{i18n('homeWatchBoardLoading')}</NoteBlock>;
  if (board.rows.length === 0) {
    return <Empty>{i18n('homeNoIntradayAnalysisToday')}</Empty>;
  }
  if (compact) {
    return (
      <div {...stylex.props(styles.watchStrip)}>
        {board.rows.map((row) => (
          <Card
            link
            {...stylex.props(styles.watchStripCell)}
            key={row.symbol}
            href={`/symbol/${encodeURIComponent(row.symbol)}`}
          >
            <span {...stylex.props(styles.watchStripSymbol)}>
              {row.symbol.replace(/\.US$/, '')}
            </span>
            {row.direction && (
              <Badge tone={directionTone(row.direction)}>
                {tradeDirectionLabel(row.direction, locale)}
              </Badge>
            )}
            {row.pct != null && <Num value={row.pct} diff suffix="%" />}
            <FollowToggle symbol={row.symbol} initialFollowing={row.ai_following} compact />
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className={`overview-grid ${stylex.props(styles.overviewGrid).className}`}>
      {board.rows.map((row) => (
        <SymbolCard key={row.symbol} row={row} />
      ))}
    </div>
  );
}
