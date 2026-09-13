import { useLocale } from '@web/lib/i18n';
import { useEffect, type ReactNode } from 'react';
import type { IntradayBuilt, TimeframeKey } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import type { SidebarTab } from '../SidebarTabs';
import type { ConclusionReassess } from './ConclusionCard';
import { IntradayChartOnly } from './IntradayChartOnly';
import { IntradaySidebar } from './IntradaySidebar';
import { useIntradayControls } from './controlsContext';
import { TimeframeSettingsMenu } from './TimeframeSettingsMenu';
import { isViewPeriod, tfLabel, tfShortLabel, type ChartTf } from './timeframes';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { ResizablePanel } from '@web/ui';

export const TF_LABELS: Record<TimeframeKey, string> = { m5: '5分钟', m15: '15分钟', h1: '1小时' };

const styles = stylex.create({
  layout: {
    display: 'flex',
    height: '100%',
    position: 'relative',
  },
  chartPane: {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 0,
  },
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

export { IntradayChartOnly } from './IntradayChartOnly';

interface IntradayDashboardProps {
  symbol: string;
  built: IntradayBuilt;
  activeTf: ChartTf;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  conclusionReassess?: ConclusionReassess;
  onLoadHistory?: () => void;
  sidebarTabs?: SidebarTab[];
  extraTabs?: SidebarTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  dock?: ReactNode;
  live?: boolean;
}

export function IntradayTimeframeSwitch({
  activeTf,
  onChange,
}: {
  activeTf: ChartTf;
  onChange: (tf: ChartTf) => void;
}) {
  const { t: i18n, locale } = useLocale();
  const { visibleTfs } = useIntradayControls();
  useEffect(() => {
    if (visibleTfs.length && !visibleTfs.includes(activeTf) && !isViewPeriod(activeTf))
      onChange(visibleTfs[0]);
  }, [visibleTfs, activeTf, onChange]);
  return (
    <div
      className={`chart-timeframe-switch ${stylex.props(styles.timeframeSwitch).className}`}
      aria-label={i18n('chartTimeframe')}
    >
      {visibleTfs.map((k) => (
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
      <TimeframeSettingsMenu />
    </div>
  );
}

export function IntradayDashboard({
  symbol,
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  conclusionReassess,
  onLoadHistory,
  sidebarTabs,
  extraTabs,
  activeTab,
  onTabChange,
  dock,
  live,
}: IntradayDashboardProps) {
  const sidebarTf = isViewPeriod(activeTf) ? built.defaultTf : activeTf;
  return (
    <div className={`layout ${stylex.props(styles.layout).className}`}>
      <IntradayChartOnly
        symbol={symbol}
        built={built}
        activeTf={activeTf}
        onLoadHistory={onLoadHistory}
        live={live}
        className={stylex.props(styles.chartPane).className}
      />
      <ResizablePanel
        side="end"
        defaultSize={340}
        minSize={280}
        maxSize={640}
        storageKey="kansoku-cockpit-sidebar-width"
        handleLabel="Resize chart details panel"
        contentClassName="intraday-sidebar-resizable-content"
      >
        <IntradaySidebar
          built={built}
          activeTf={sidebarTf}
          predictionUpdatedAt={predictionUpdatedAt}
          predictionStale={predictionStale}
          conclusionReassess={conclusionReassess}
          tabsOverride={sidebarTabs}
          extraTabs={extraTabs}
          active={activeTab}
          onActiveChange={onTabChange}
          dock={dock}
          live={live}
        />
      </ResizablePanel>
    </div>
  );
}
