import * as stylex from '@stylexjs/stylex';
import type { ScanItem, ScanItemStatus, ScanSetup } from '@kansoku/shared/types';
import { symbolAnalysisPath } from '@kansoku/shared/chartUrl';
import { fmt } from '@web/lib/format';
import { useLocale, type MessageKey } from '@web/lib/i18n';
import { Badge, NoteBlock, Spinner } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { directionLabel } from '../scorecard/scorecardLabels';

const STATUS_LABEL: Record<ScanItemStatus, MessageKey> = {
  queued: 'scanStatusQueued',
  running: 'scanStatusRunning',
  done: 'scanStatusDone',
  failed: 'scanStatusFailed',
  skipped: 'scanStatusSkipped',
  cancelled: 'scanStatusCancelled',
};
/** Reasons the scanner reports in English; anything else (a raw error) is shown as-is. */
const REASON_LABEL: Record<string, MessageKey> = {
  'already running': 'scanItemAlreadyRunning',
  'no prediction was submitted': 'scanItemNoPrediction',
};

const STATUS_TONE: Partial<Record<ScanItemStatus, 'up' | 'down' | 'muted' | 'accent'>> = {
  running: 'accent',
  done: 'up',
  failed: 'down',
  skipped: 'muted',
  cancelled: 'muted',
};

const styles = stylex.create({
  list: { display: 'flex', flexDirection: 'column' },
  row: {
    'alignItems': 'center',
    'borderTopColor': colors.border,
    'borderTopStyle': 'solid',
    'borderTopWidth': '1px',
    'color': 'inherit',
    'display': 'grid',
    'fontSize': fontSizes.sm,
    'gap': '10px',
    'gridTemplateColumns': '28px minmax(70px, 1fr) 60px repeat(5, minmax(56px, 80px))',
    'padding': '7px 4px',
    'textDecoration': 'none',
    ':hover': { color: colors.accent },
  },
  rangeRow: {
    gridTemplateColumns: 'minmax(70px, 1fr) 90px minmax(120px, 1fr)',
  },
  itemRow: {
    gridTemplateColumns: 'minmax(70px, 1fr) 90px minmax(0, 2fr)',
  },
  head: { color: colors.textSecondary },
  rank: { color: colors.textMuted, fontFamily: fonts.mono },
  symbol: { fontWeight: 600 },
  num: { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  up: { color: colors.up },
  down: { color: colors.down },
  reason: { color: colors.textMuted, overflowWrap: 'anywhere' },
  scroll: { overflowX: 'auto' },
});

const price = (value: number | null) => (value == null ? '—' : fmt(value));
const bare = (symbol: string) => symbol.replace(/\.US$/, '');

export function SetupList({ setups }: { setups: readonly ScanSetup[] }) {
  const { t, locale } = useLocale();
  if (setups.length === 0) return <NoteBlock>{t('scanNoSetups')}</NoteBlock>;
  return (
    <div className={stylex.props(styles.scroll).className}>
      <div className={`scan-setups ${stylex.props(styles.list).className}`}>
        <div className={stylex.props(styles.row, styles.head).className}>
          <span>#</span>
          <span />
          <span />
          <span className={stylex.props(styles.num).className}>{t('scanScore')}</span>
          <span className={stylex.props(styles.num).className}>{t('scorecardConviction')}</span>
          <span className={stylex.props(styles.num).className}>{t('scanRewardRisk')}</span>
          <span className={stylex.props(styles.num).className}>{t('scanEntry')}</span>
          <span className={stylex.props(styles.num).className}>{t('scanTarget')}</span>
        </div>
        {setups.map((setup, index) => (
          <a
            key={setup.symbol}
            className={`scan-setup-row ${stylex.props(styles.row).className}`}
            href={symbolAnalysisPath(setup.symbol, setup.chart_id)}
            title={`${t('scanStopPrice')} ${price(setup.stop)}`}
          >
            <span className={stylex.props(styles.rank).className}>{index + 1}</span>
            <span className={stylex.props(styles.symbol).className}>{bare(setup.symbol)}</span>
            <span
              className={stylex.props(setup.direction === 'long' ? styles.up : styles.down).className}
            >
              {directionLabel(setup.direction, locale)}
            </span>
            <span className={stylex.props(styles.num).className}>{fmt(setup.score)}</span>
            <span className={stylex.props(styles.num).className}>{setup.conviction ?? '—'}</span>
            <span className={stylex.props(styles.num).className}>
              {setup.reward_risk == null ? '—' : `${fmt(setup.reward_risk, 1)} : 1`}
            </span>
            <span className={stylex.props(styles.num).className}>{price(setup.entry)}</span>
            <span className={stylex.props(styles.num).className}>{price(setup.target1)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function RangeList({ ranges }: { ranges: readonly ScanSetup[] }) {
  const { t } = useLocale();
  return (
    <div className={stylex.props(styles.list).className}>
      {ranges.map((setup) => (
        <a
          key={setup.symbol}
          className={stylex.props(styles.row, styles.rangeRow).className}
          href={symbolAnalysisPath(setup.symbol, setup.chart_id)}
        >
          <span className={stylex.props(styles.symbol).className}>{bare(setup.symbol)}</span>
          <span className={stylex.props(styles.num).className}>{setup.conviction ?? '—'}</span>
          <span className={stylex.props(styles.num).className}>
            {t('scanRange')} {price(setup.range_low)} – {price(setup.range_high)}
          </span>
        </a>
      ))}
    </div>
  );
}

export function ItemList({ items }: { items: readonly ScanItem[] }) {
  const { t } = useLocale();
  return (
    <div className={`scan-items ${stylex.props(styles.list).className}`}>
      {items.map((item) => {
        const label = (
          <>
            <span className={stylex.props(styles.symbol).className}>{bare(item.symbol)}</span>
            <span>
              <Badge tone={STATUS_TONE[item.status]}>
                {item.status === 'running' && <Spinner />}
                {t(STATUS_LABEL[item.status])}
              </Badge>
            </span>
            <span className={stylex.props(styles.reason).className}>
              {item.reason ? (REASON_LABEL[item.reason] ? t(REASON_LABEL[item.reason]) : item.reason) : ''}
            </span>
          </>
        );
        return item.chart_id ? (
          <a
            key={item.symbol}
            className={stylex.props(styles.row, styles.itemRow).className}
            href={symbolAnalysisPath(item.symbol, item.chart_id)}
          >
            {label}
          </a>
        ) : (
          <div key={item.symbol} className={stylex.props(styles.row, styles.itemRow).className}>
            {label}
          </div>
        );
      })}
    </div>
  );
}
