import { useLocale } from '@web/lib/i18n';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { IntradayChartOnly } from './IntradayChartOnly';
import { IntradayTimeframeSwitch } from './IntradayTimeframeSwitch';
import {
  cellKeys,
  type ChartGridState,
  type GridLayout,
  type GridSplits,
  type SplitAxis,
} from './chartGridState';
import { GridSplitter } from './GridSplitter';
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
    position: 'relative',
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
  dropRing: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 8%, transparent)`,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    borderWidth: '2px',
    inset: 0,
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: 31,
  },
  dragging: {
    opacity: 0.55,
  },
  grip: {
    color: colors.textMuted,
    cursor: 'grab',
    display: 'inline-flex',
    flexShrink: 0,
    marginLeft: '-4px',
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

const ONE_TRACK = 'minmax(0, 1fr)';
const twoTracks = (first: number) =>
  `minmax(0, ${first}fr) minmax(0, ${Math.round((1 - first) * 1000) / 1000}fr)`;

/** Grid tracks for a layout: the dividers set each chart's share of the space. */
function templateFor(layout: Exclude<GridLayout, '1'>, splits: GridSplits) {
  return {
    columns: layout === '2v' ? ONE_TRACK : twoTracks(splits.col),
    rows: layout === '2h' ? ONE_TRACK : twoTracks(splits.row),
  };
}

/** Which dividers a layout has: between columns, between rows, or both. */
const SPLIT_AXES: Record<Exclude<GridLayout, '1'>, SplitAxis[]> = {
  '2h': ['col'],
  '2v': ['row'],
  '4': ['col', 'row'],
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

/** Marks a drag as one of this grid's charts, so dropped files and text are ignored. */
const DRAG_TYPE = 'application/x-kansoku-chart-cell';

interface DragState {
  from: number;
  over: number | null;
}

/**
 * Several charts of one stock, each on its own timeframe. Hovering one marks the same
 * moment in the others; the selected chart carries the drawing toolbar and drives the
 * toolbar menus and the analysis panel. Dragging a chart by its title bar onto another
 * trades their places.
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
  const keys = cellKeys(grid.tfs);
  const panesRef = useRef(new Map<string, GridPane>());
  const [paneVersion, setPaneVersion] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // A divider being dragged moves here first; the saved position updates when it is let go.
  const [draft, setDraft] = useState<{ axis: SplitAxis; value: number } | null>(null);

  const setPane = useCallback((key: string, pane: GridPane | null) => {
    if (pane) panesRef.current.set(key, pane);
    else panesRef.current.delete(key);
    setPaneVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const panes = [...panesRef.current.values()];
    if (panes.length < 2) return;
    return linkGridCrosshairs(panes);
  }, [paneVersion]);

  const layout = grid.layout === '1' ? '4' : grid.layout;
  const splits: GridSplits = draft ? { ...grid.splits, [draft.axis]: draft.value } : grid.splits;
  const template =
    grid.maximized !== null
      ? { columns: ONE_TRACK, rows: ONE_TRACK }
      : templateFor(layout, splits);
  const canDrag = count > 1 && grid.maximized === null;

  const dnd = (index: number): CellDnd => ({
    draggable: canDrag,
    dragging: drag?.from === index,
    dropTarget: drag !== null && drag.from !== index && drag.over === index,
    onDragStart: () => setDrag({ from: index, over: null }),
    onDragEnd: () => setDrag(null),
    onDragOver: (event) => {
      if (!drag || drag.from === index || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (drag.over !== index) setDrag({ ...drag, over: index });
    },
    onDragLeave: (event) => {
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) return;
      setDrag((now) => (now && now.over === index ? { ...now, over: null } : now));
    },
    onDrop: (event) => {
      if (!drag || drag.from === index || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      grid.swapCells(drag.from, index);
      setDrag(null);
    },
  });

  return (
    <div
      ref={gridRef}
      className={`chart-grid ${stylex.props(styles.grid).className}${className ? ` ${className}` : ''}`}
      style={{ gridTemplateColumns: template.columns, gridTemplateRows: template.rows }}
      data-layout={grid.layout}
    >
      {grid.tfs.map((tf, index) => (
        <ChartGridCell
          key={keys[index]}
          id={keys[index]}
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
          dnd={dnd(index)}
        />
      ))}
      {grid.maximized === null &&
        SPLIT_AXES[layout].map((axis) => (
          <GridSplitter
            key={axis}
            axis={axis}
            value={splits[axis]}
            containerRef={gridRef}
            onDraft={(value) => setDraft(value === null ? null : { axis, value })}
            onCommit={(value) => grid.setSplit(axis, value)}
          />
        ))}
    </div>
  );
}

interface CellDnd {
  draggable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

function ChartGridCell({
  id,
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
  dnd,
}: {
  /** The chart's stable name (see cellKeys); `index` is where it sits now. */
  id: string;
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
  onPane: (id: string, pane: GridPane | null) => void;
  dnd: CellDnd;
}) {
  const { t: i18n, locale } = useLocale();
  const tf = resolveIntradayTf(built, wantedTf);
  const view = useViewTimeframe(symbol, tf, { asOf, live });
  const cellBuilt = withViewTimeframe(built, tf, view.tf);
  const candles = tfDataOf(cellBuilt, tf)?.candles;
  const times = useMemo(() => (candles ?? []).map((c) => c.time), [candles]);
  // A drag that starts on a timeframe or enlarge button is a click, not a move.
  const pressedButtonRef = useRef(false);

  const readRef = useRef({ times, tf });
  readRef.current = { times, tf };

  const onChartHandle = useCallback(
    (handle: DrawingChartHandle | null) => {
      onPane(
        id,
        handle
          ? { chart: handle.chart, series: handle.series, read: () => readRef.current }
          : null,
      );
    },
    [id, onPane],
  );
  const onTfChange = useCallback((next: ChartTf) => grid.setCellTf(index, next), [grid, index]);
  const label = i18n('chartGridCell', { n: index + 1, tf: tfLabel(tf, locale) });

  return (
    <section
      className={`chart-grid-cell ${stylex.props(styles.cell, hidden && styles.cellHidden, dnd.dragging && styles.dragging).className}`}
      aria-label={label}
      aria-hidden={hidden || undefined}
      data-active={active || undefined}
      onPointerDownCapture={() => {
        if (!active) grid.selectCell(index);
      }}
      onDragOver={dnd.onDragOver}
      onDragLeave={dnd.onDragLeave}
      onDrop={dnd.onDrop}
    >
      <div
        className={`chart-grid-cell-header ${stylex.props(styles.header).className}`}
        draggable={dnd.draggable}
        onPointerDown={(event) => {
          pressedButtonRef.current = (event.target as HTMLElement).closest('button') !== null;
        }}
        onDragStart={(event) => {
          if (pressedButtonRef.current) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.setData(DRAG_TYPE, String(index));
          event.dataTransfer.effectAllowed = 'move';
          dnd.onDragStart();
        }}
        onDragEnd={dnd.onDragEnd}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          grid.toggleMaximize(index);
        }}
        title={dnd.draggable ? i18n('chartGridHeaderHelp') : i18n('chartGridHeaderHelpEnlarged')}
      >
        {dnd.draggable && (
          <span className={`chart-grid-grip ${stylex.props(styles.grip).className}`} aria-hidden="true">
            <GripVertical size={13} />
          </span>
        )}
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
      {dnd.dropTarget && (
        <div
          className={`chart-grid-drop ${stylex.props(styles.dropRing).className}`}
          aria-hidden="true"
        />
      )}
    </section>
  );
}
