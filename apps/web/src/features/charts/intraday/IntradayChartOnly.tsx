import { useLocale } from '@web/lib/i18n';
import { Component, lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { fmt } from '@web/lib/format';
import { colors, fontSizes } from '../../../theme/tokens.stylex';
import type { DrawingsHandle } from '../drawings/useDrawings';
import { namespacedKey, useIntradayControls } from './controlsContext';
import { isSessionlessTf, tfDataOf, type ChartTf } from './timeframes';
import { useLiveBuilt } from './useLiveBuilt';
import { bollinger, rsi } from '@kansoku/core/analysis/indicators';
import { useMaSeries } from './useMaLines';
import { useIntradayCharts, type DrawingChartHandle } from './useIntradayCharts';
import { IndicatorPane } from './IndicatorPane';

const styles = stylex.create({
  chartsCol: {
    borderRightColor: colors.border,
    borderRightStyle: 'solid',
    borderRightWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  popoutChartsCol: {
    borderRightStyle: 'none',
    borderRightWidth: 0,
    height: '100%',
  },
  chartBlock: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    position: 'relative',
  },
  mainChart: {
    flex: '1 1 0px',
    minHeight: 'min(120px, 30%)',
  },
  macdChart: {
    borderBottomColor: colors.textPrimary,
    borderBottomStyle: 'none',
    borderBottomWidth: 0,
    minHeight: 0,
  },
  rsiChart: {
    minHeight: 0,
    overflow: 'hidden',
  },
  chartHost: {
    height: '100%',
    width: '100%',
  },
  chartLabel: {
    backgroundColor: 'rgba(10, 10, 10, 0.7)',
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    left: '12px',
    letterSpacing: '0.05em',
    padding: '2px 8px',
    position: 'absolute',
    textTransform: 'uppercase',
    top: '8px',
    zIndex: 10,
  },
  chartLegend: {
    backgroundColor: 'rgba(10, 10, 10, 0.7)',
    color: colors.textPrimary,
    display: 'flex',
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    gap: '14px',
    left: '110px',
    padding: '2px 8px',
    position: 'absolute',
    top: '8px',
    zIndex: 10,
  },
  swatch: {
    display: 'inline-block',
    height: '2px',
    marginRight: '4px',
    verticalAlign: 'middle',
    width: '10px',
  },
});

const DrawingsLayer = lazy(() =>
  import('./DrawingsLayer').then((m) => ({ default: m.DrawingsLayer })),
);

class DrawingsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface IntradayChartOnlyProps {
  symbol: string;
  built: IntradayBuilt;
  activeTf: ChartTf;
  onLoadHistory?: () => void;
  drawings?: boolean;
  storageNamespace?: string;
  onChartHandle?: (handle: DrawingChartHandle | null) => void;
  popout?: boolean;
  live?: boolean;
  className?: string;
}

export function IntradayChartOnly({
  symbol,
  built: frozenBuilt,
  activeTf,
  onLoadHistory,
  drawings = true,
  storageNamespace,
  onChartHandle,
  popout = false,
  live = false,
  className,
}: IntradayChartOnlyProps) {
  const { t: i18n } = useLocale();
  const built = useLiveBuilt(frozenBuilt, activeTf, symbol, live);
  const mainBlockRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const { toggles, markerRange, maLines } = useIntradayControls();
  const [drawingHandle, setDrawingHandle] = useState<DrawingsHandle | null>(null);
  const candles = useMemo(() => tfDataOf(built, activeTf)?.candles ?? [], [built, activeTf]);
  const maSeries = useMaSeries(candles, maLines);
  const rsiLast = useMemo(() => {
    if (!toggles.rsi || candles.length < 15) return null;
    return rsi(
      candles.map((c) => c.close),
      14,
    ).at(-1);
  }, [toggles.rsi, candles]);
  const bollLast = useMemo(() => {
    if (!toggles.boll || candles.length < 20) return null;
    const bb = bollinger(
      candles.map((c) => c.close),
      20,
      2,
    );
    for (let i = bb.mid.length - 1; i >= 0; i--) {
      if (bb.mid[i] !== null) return bb.mid[i];
    }
    return null;
  }, [toggles.boll, candles]);
  useIntradayCharts(
    built,
    activeTf,
    mainRef,
    macdRef,
    rsiRef,
    onLoadHistory,
    toggles,
    markerRange,
    maSeries,
    (handle) => {
      setDrawingHandle(handle);
      onChartHandle?.(handle);
    },
  );
  const barTimes = useMemo(() => candles.map((c) => c.time), [candles]);

  return (
    <div
      className={`charts-col${className ? ` ${className}` : ''} ${stylex.props(styles.chartsCol, popout && styles.popoutChartsCol).className}`}
    >
      <div
        ref={mainBlockRef}
        className={`chart-block ${stylex.props(styles.chartBlock, styles.mainChart).className}`}
      >
        <div className={`chart-label ${stylex.props(styles.chartLabel).className}`}>
          {i18n('chartCandlesVolume')}
        </div>
        <div className={`chart-legend ${stylex.props(styles.chartLegend).className}`}>
          {maSeries
            .filter((s) => s.line.visible)
            .map((s) => (
              <span key={s.line.id}>
                <span
                  className={`swatch ${stylex.props(styles.swatch).className}`}
                  style={{ background: s.line.color }}
                />
                EMA{s.line.period}
                {s.last !== null && ` $${fmt(s.last)}`}
              </span>
            ))}
          {toggles.boll && (
            <span>
              <span
                className={`swatch ${stylex.props(styles.swatch).className}`}
                style={{ background: '#38bdf8' }}
              />
              BOLL(20)
              {bollLast !== null && ` $${fmt(bollLast)}`}
            </span>
          )}
          {!isSessionlessTf(activeTf) && (
            <>
              <span>
                <span
                  className={`swatch ${stylex.props(styles.swatch).className}`}
                  style={{ background: 'rgba(232,232,232,0.3)' }}
                />
                {i18n('chartExtendedSession')}
              </span>
              <span>
                <span
                  className={`swatch ${stylex.props(styles.swatch).className}`}
                  style={{ background: 'rgba(70,100,180,0.7)' }}
                />
                {i18n('chartOvernight')}
              </span>
            </>
          )}
        </div>
        {drawings && (
          <DrawingsBoundary>
            <Suspense fallback={null}>
              <DrawingsLayer symbol={symbol} handle={drawingHandle} barTimes={barTimes} />
            </Suspense>
          </DrawingsBoundary>
        )}
        <div ref={mainRef} className={`chart-host ${stylex.props(styles.chartHost).className}`} />
      </div>
      <IndicatorPane
        visible={toggles.macd}
        defaultHeight={190}
        minHeight={100}
        storageKey={namespacedKey('intraday-macd-height', storageNamespace)}
        label={i18n('chartResizeMacd')}
        help={i18n('chartResizePaneHelp', { indicator: i18n('indicatorMacd') })}
        mainRef={mainBlockRef}
        className={`chart-block macd ${stylex.props(styles.chartBlock, styles.macdChart).className}`}
      >
        <div className={`chart-label ${stylex.props(styles.chartLabel).className}`}>
          MACD (12,26,9)
        </div>
        <div ref={macdRef} className={`chart-host ${stylex.props(styles.chartHost).className}`} />
      </IndicatorPane>
      <IndicatorPane
        visible={toggles.rsi}
        defaultHeight={100}
        minHeight={80}
        storageKey={namespacedKey('intraday-rsi-height', storageNamespace)}
        label={i18n('chartResizeRsi')}
        help={i18n('chartResizePaneHelp', { indicator: i18n('indicatorRsi') })}
        mainRef={mainBlockRef}
        className={`chart-block rsi ${stylex.props(styles.chartBlock, styles.rsiChart).className}`}
      >
        {toggles.rsi && (
          <div className={`chart-label ${stylex.props(styles.chartLabel).className}`}>
            RSI (14)
            {typeof rsiLast === 'number' && ` ${rsiLast.toFixed(1)}`}
          </div>
        )}
        <div ref={rsiRef} className={`chart-host ${stylex.props(styles.chartHost).className}`} />
      </IndicatorPane>
    </div>
  );
}
