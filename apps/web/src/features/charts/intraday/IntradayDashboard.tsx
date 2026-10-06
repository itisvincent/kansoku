import { type ReactNode } from 'react';
import type { IntradayBuilt, TimeframeKey } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import type { SidebarTab } from '../SidebarTabs';
import type { ConclusionReassess } from './ConclusionCard';
import { IntradayChartOnly } from './IntradayChartOnly';
import { ChartGrid } from './ChartGrid';
import type { ChartGridState } from './chartGridState';
import { IntradaySidebar } from './IntradaySidebar';
import type { ChartTf } from './timeframes';
import { ResizablePanel } from '@web/ui';
import { PriceSignProvider } from '@web/lib/priceSignContext';

export const TF_LABELS: Record<TimeframeKey, string> = { m5: '5分钟', m15: '15分钟', h1: '1小时' };

const styles = stylex.create({
  layout: {
    display: 'flex',
    height: '100%',
    minHeight: 0,
    maxHeight: '100vh',
    overflow: 'hidden',
    position: 'relative',
  },
  chartPane: {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 0,
  },
});

export { IntradayChartOnly } from './IntradayChartOnly';
export { IntradayTimeframeSwitch } from './IntradayTimeframeSwitch';

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
  /** Several charts side by side; without it (or with one chart) the page shows one chart. */
  grid?: ChartGridState;
  /**
   * The chart data before the page adds its own timeframe's candles. Each grid chart adds
   * its own, so a page-level refresh does not redraw every chart.
   */
  gridBuilt?: IntradayBuilt;
  /** The analysis time a frozen view loads its extra timeframes up to. */
  asOf?: string;
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
  grid,
  gridBuilt,
  asOf,
}: IntradayDashboardProps) {
  return (
    <PriceSignProvider symbol={symbol}>
      <div className={`layout ${stylex.props(styles.layout).className}`}>
        {grid && grid.layout !== '1' ? (
          <ChartGrid
            symbol={symbol}
            built={gridBuilt ?? built}
            grid={grid}
            asOf={asOf}
            live={live}
            onLoadHistory={onLoadHistory}
            className={stylex.props(styles.chartPane).className}
          />
        ) : (
          <IntradayChartOnly
            symbol={symbol}
            built={built}
            activeTf={activeTf}
            onLoadHistory={onLoadHistory}
            live={live}
            className={stylex.props(styles.chartPane).className}
          />
        )}
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
            activeTf={activeTf}
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
    </PriceSignProvider>
  );
}
