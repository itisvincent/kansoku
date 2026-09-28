import * as stylex from '@stylexjs/stylex';
import type { ScorecardGroup } from '@kansoku/shared/types';
import { signed } from '@web/lib/format';
import { useLocale } from '@web/lib/i18n';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import { formatRate, MIN_SETTLED } from './scorecardLabels';

const styles = stylex.create({
  table: {
    borderCollapse: 'collapse',
    fontSize: fontSizes.sm,
    width: '100%',
  },
  head: {
    color: colors.textSecondary,
    fontWeight: 500,
    padding: '6px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  headFirst: {
    textAlign: 'left',
  },
  row: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  dim: {
    color: colors.textMuted,
  },
  cell: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
    padding: '7px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  label: {
    padding: '7px 8px',
    textAlign: 'left',
  },
  rateCell: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  track: {
    backgroundColor: colors.border,
    borderRadius: radii.default,
    height: '6px',
    overflow: 'hidden',
    width: '64px',
  },
  fill: {
    backgroundColor: colors.up,
    height: '100%',
  },
  fillLow: {
    backgroundColor: colors.down,
  },
  up: { color: colors.up },
  down: { color: colors.down },
  scroll: {
    overflowX: 'auto',
  },
});

function settledCount(group: ScorecardGroup): number {
  const { hit_target, hit_stop, held_range, broke_range } = group.bucket;
  return hit_target + hit_stop + held_range + broke_range;
}

export function ScorecardTable({
  groups,
  labelOf,
}: {
  groups: readonly ScorecardGroup[];
  labelOf: (key: string) => string;
}) {
  const { t } = useLocale();
  return (
    <div className={stylex.props(styles.scroll).className}>
      <table className={`scorecard-table ${stylex.props(styles.table).className}`}>
        <thead>
          <tr>
            <th className={stylex.props(styles.head, styles.headFirst).className}>
              {t('scorecardGroup')}
            </th>
            <th className={stylex.props(styles.head).className}>{t('scorecardCalls')}</th>
            <th className={stylex.props(styles.head).className}>{t('scorecardSettled')}</th>
            <th className={stylex.props(styles.head).className}>{t('scorecardWinRate')}</th>
            <th className={stylex.props(styles.head).className} title={t('scorecardAvgRHint')}>
              {t('scorecardAvgR')}
            </th>
            <th className={stylex.props(styles.head).className}>{t('scorecardStillOpen')}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const settled = settledCount(group);
            const thin = settled < MIN_SETTLED;
            const rate = group.bucket.win_rate;
            const avgR = group.bucket.avg_r;
            return (
              <tr
                key={group.key}
                className={stylex.props(styles.row, thin && styles.dim).className}
                title={thin ? t('scorecardFewSamples', { count: MIN_SETTLED }) : undefined}
                data-thin={thin ? 'true' : undefined}
              >
                <td className={stylex.props(styles.label).className}>{labelOf(group.key)}</td>
                <td className={stylex.props(styles.cell).className}>{group.bucket.total}</td>
                <td className={stylex.props(styles.cell).className}>{settled}</td>
                <td className={stylex.props(styles.cell).className}>
                  <span className={stylex.props(styles.rateCell).className}>
                    {rate != null && (
                      <span className={stylex.props(styles.track).className} aria-hidden>
                        <span
                          className={stylex.props(styles.fill, rate < 0.5 && styles.fillLow).className}
                          style={{ width: `${Math.round(rate * 100)}%`, display: 'block' }}
                        />
                      </span>
                    )}
                    {formatRate(rate)}
                  </span>
                </td>
                <td
                  className={
                    stylex.props(
                      styles.cell,
                      !thin && avgR != null && (avgR >= 0 ? styles.up : styles.down),
                    ).className
                  }
                >
                  {avgR == null ? '—' : signed(avgR)}
                </td>
                <td className={stylex.props(styles.cell).className}>
                  {group.bucket.open + group.bucket.unjudged}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
