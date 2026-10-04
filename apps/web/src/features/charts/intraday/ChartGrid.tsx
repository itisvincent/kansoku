import { useLocale } from '@web/lib/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { IntradayChartOnly } from './IntradayChartOnly';
import { IntradayTimeframeSwitch } from './IntradayTimeframeSwitch';
import type { ChartGridState, GridLayout } from './chartGridState';
import { linkGridCrosshairs, type GridPane } from './gridCrosshair';
import { isViewPeriod, tfDataOf, tfLabel, withViewTimeframe, type ChartTf } from './timeframes';
import { resolveIntradayTf } from './useIntradayDoc';
import { useViewTimeframe } from './useViewTimeframe';
import type { DrawingChartHandle } from './useIntradayCharts';

const styles = stylex.create({
  grid: {
    backgroundColor: colors.border,
    display: 'grid',
    gap: '1px',
    height: '100%',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  cell: {
    backgroundColor: colors.backgroundSurface,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  cellHidden: {
    display: 'none',
  },
  activeRing: {
    borderColor: colors.accent,
    borderStyle: 'solid',
    borderWidth: '1px',
    inset: 0,
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: 30,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flexShrink: 0,
    gap: '8px',
    height: '30px',
    padding: '0 6px 0 8px',
    userSelect: 'none',
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  noteError: {
    color: colors.down,
  },
  enlarge: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderRadius': radii.default,
    'borderStyle': 'none',
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'height': '22px',
    'justifyContent': 'center',
    'marginLeft': 'auto',
    'width': '24px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
  },
  chart: {
    flex: '1 1 auto',
    minHeight: 0,
  },
});

const TEMPLATES: Record<Exclude<GridLayout, '1'>, { columns: string; rows: string }> = {
  '2h': { columns: 'minmax(0, 1fr) minmax(0, 1fr)', rows: 'minmax(0, 1fr)' },
  '2v': { columns: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr) minmax(0, 1fr)' },
  '4': { columns: 'minmax(0, 1fr) minmax(0, 1fr)', rows: 'minmax(0, 1fr) minmax(0, 1fr)' },
};

interface ChartGridProps {
  symbol: string;
  /** The page's chart data; each chart adds its own timeframe's candles to it. */
  built: IntradayBuilt;
  grid: ChartGridState;
  asOf?: string;
  live?: boolean;
  onLoadHistory?: () => void;
  className?: string;
}

/**
 * Several charts of one stock, each on its own timeframe. Hovering one marks the same
 * moment in the others; the selected chart carries the drawing toolbar and drives the
 * toolbar menus and the analysis panel.
 */
export function ChartGrid({
  symbol,
  built,
  grid,
  asOf,
  live,
  onLoadHistory,
  className,
}: ChartGridProps) {
  const count = grid.tfs.length;
  const panesRef = useRef<(GridPane | null)[]>([]);
  const [paneVersion, setPaneVersion] = useState(0);

  const setPane = useCallback((index: number, pane: GridPane | null) => {
    panesRef.current[index] = pane;
    setPaneVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const panes = panesRef.current.slice(0, count).filter((p): p is GridPane => p !== null);
    if (panes.length < 2) return;
    return linkGridCrosshairs(panes);
  }, [paneVersion, count]);

  const layout = grid.layout === '1' ? '4' : grid.layout;
  const template =
    grid.maximized !== null ? { columns: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr)' } : TEMPLATES[layout];

  return (
    <div
      className={`chart-grid ${stylex.props(styles.grid).className}${className ? ` ${className}` : ''}`}
      style={{ gridTemplateColumns: template.columns, gridTemplateRows: template.rows }}
      data-layout={grid.layout}
    >
      {grid.tfs.map((tf, index) => (
        <ChartGridCell
          key={index}
          index={index}
          symbol={symbol}
          built={built}
          tf={tf}
          active={index === grid.activeCell}
          ring={count > 1 && grid.maximized === null && index === grid.activeCell}
          hidden={grid.maximized !== null && grid.maximized !== index}
          maximized={grid.maximized === index}
          grid={grid}
          asOf={asOf}
          live={live}
          onLoadHistory={onLoadHistory}
          onPane={setPane}
        />
      ))}
    </div>
  );
}

function ChartGridCell({
  index,
  symbol,
  built,
  tf: wantedTf,
  active,
  ring,
  hidden,
  maximized,
  grid,
  asOf,
  live,
  onLoadHistory,
  onPane,
}: {
  index: number;
  symbol: string;
  built: IntradayBuilt;
  tf: ChartTf;
  active: boolean;
  ring: boolean;
  hidden: boolean;
  maximized: boolean;
  grid: ChartGridState;
  asOf?: string;
  live?: boolean;
  onLoadHistory?: () => void;
  onPane: (index: number, pane: GridPane | null) => void;
}) {
  const { t: i18n, locale } = useLocale();
  const tf = resolveIntradayTf(built, wantedTf);
  const view = useViewTimeframe(symbol, tf, { asOf, live });
  const cellBuilt = withViewTimeframe(built, tf, view.tf);
  const candles = tfDataOf(cellBuilt, tf)?.candles;
  const times = useMemo(() => (candles ?? []).map((c) => c.time), [candles]);

  const readRef = useRef({ times, tf });
  readRef.current = { times, tf };

  const onChartHandle = useCallback(
    (handle: DrawingChartHandle | null) => {
      onPane(
        index,
        handle
          ? { chart: handle.chart, series: handle.series, read: () => readRef.current }
          : null,
      );
    },
    [index, onPane],
  );
  const onTfChange = useCallback((next: ChartTf) => grid.setCellTf(index, next), [grid, index]);
  const label = i18n('chartGridCell', { n: index + 1, tf: tfLabel(tf, locale) });

  return (
    <section
      className={`chart-grid-cell ${stylex.props(styles.cell, hidden && styles.cellHidden).className}`}
      aria-label={label}
      aria-hidden={hidden || undefined}
      data-active={active || undefined}
      onPointerDownCapture={() => {
        if (!active) grid.selectCell(index);
      }}
    >
      <div
        className={`chart-grid-cell-header ${stylex.props(styles.header).className}`}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          grid.toggleMaximize(index);
        }}
        title={i18n('chartGridHeaderHelp')}
      >
        <IntradayTimeframeSwitch activeTf={tf} onChange={onTfChange} compact />
        {view.loading && !view.tf && (
          <span className={stylex.props(styles.note).className}>{i18n('chartLoading')}</span>
        )}
        {view.notice && (
          <span className={stylex.props(styles.note).className} title={view.notice}>
            {i18n('chartHistoryShort')}
          </span>
        )}
        {view.error && (
          <span
            className={stylex.props(styles.note, styles.noteError).className}
            title={view.error}
          >
            {i18n('cockpitTimeframeFailed')}
          </span>
        )}
        <button
          type="button"
          className={`chart-grid-enlarge ${stylex.props(styles.enlarge).className}`}
          onClick={() => grid.toggleMaximize(index)}
          aria-label={maximized ? i18n('chartGridRestore') : i18n('chartGridMaximize')}
          title={maximized ? i18n('chartGridRestore') : i18n('chartGridMaximize')}
        >
          {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
      <IntradayChartOnly
        symbol={symbol}
        built={cellBuilt}
        activeTf={tf}
        // Older history extends the analysis periods only; the others load their own.
        onLoadHistory={isViewPeriod(tf) ? undefined : onLoadHistory}
        drawingToolbar={active}
        storageNamespace="chart-grid"
        onChartHandle={onChartHandle}
        popout
        compact
        live={live}
        className={stylex.props(styles.chart).className}
      />
      {ring && <div className={stylex.props(styles.activeRing).className} aria-hidden="true" />}
    </section>
  );
}
