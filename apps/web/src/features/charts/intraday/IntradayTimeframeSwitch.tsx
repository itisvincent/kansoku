import { useLocale } from '@web/lib/i18n';
import { useEffect } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useIntradayControls } from './controlsContext';
import { TimeframeSettingsMenu } from './TimeframeSettingsMenu';
import {
  isViewPeriod,
  sanitizeTimeframes,
  tfLabel,
  tfShortLabel,
  type ChartTf,
} from './timeframes';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  timeframeSwitch: {
    display: 'inline-flex',
    gap: '2px',
    padding: '2px',
    backgroundColor: colors.backgroundCanvas,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
  },
  timeframeButton: {
    'minWidth': '30px',
    'height': '20px',
    'padding': '0 7px',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.default,
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'fontVariantNumeric': 'tabular-nums',
    'lineHeight': '20px',
    'cursor': 'pointer',
    ':hover': {
      color: colors.textPrimary,
      backgroundColor: colors.backgroundHover,
    },
  },
  timeframeButtonActive: {
    color: colors.textPrimary,
    backgroundColor: colors.backgroundHover,
  },
});

export function IntradayTimeframeSwitch({
  activeTf,
  onChange,
  compact = false,
}: {
  activeTf: ChartTf;
  onChange: (tf: ChartTf) => void;
  /**
   * A grid chart's own switch: no settings gear (the toolbar has one), and the chart's
   * period always shows even if the toolbar hides it, so it reads as selected.
   */
  compact?: boolean;
}) {
  const { t: i18n, locale } = useLocale();
  const { visibleTfs } = useIntradayControls();
  useEffect(() => {
    if (visibleTfs.length && !visibleTfs.includes(activeTf) && !isViewPeriod(activeTf))
      onChange(visibleTfs[0]);
  }, [visibleTfs, activeTf, onChange]);
  const shown =
    compact && isViewPeriod(activeTf) && !visibleTfs.includes(activeTf)
      ? sanitizeTimeframes([...visibleTfs, activeTf])
      : visibleTfs;
  return (
    <div
      className={`chart-timeframe-switch ${stylex.props(styles.timeframeSwitch).className}`}
      aria-label={i18n('chartTimeframe')}
    >
      {shown.map((k) => (
        <button
          key={k}
          className={
            stylex.props(styles.timeframeButton, k === activeTf && styles.timeframeButtonActive)
              .className
          }
          aria-pressed={k === activeTf}
          onClick={() => onChange(k)}
          title={tfLabel(k, locale)}
        >
          {tfShortLabel(k, locale)}
        </button>
      ))}
      {!compact && <TimeframeSettingsMenu />}
    </div>
  );
}
