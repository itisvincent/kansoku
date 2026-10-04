import { useCallback, useState, useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from '@web/lib/safeStorage';
import { DEFAULT_CHART_TF, isSessionlessTf, TF_OPTIONS, type ChartTf } from './timeframes';

/** One chart, two side by side, two stacked, or a 2 × 2 grid. */
export type GridLayout = '1' | '2h' | '2v' | '4';
export type MultiLayout = Exclude<GridLayout, '1'>;

export const GRID_LAYOUTS: GridLayout[] = ['1', '2h', '2v', '4'];
export const GRID_STORAGE_KEY = 'chart-grid';

/** Read left to right, top to bottom: the bigger picture first. */
export const DEFAULT_GRID_TFS: Record<MultiLayout, ChartTf[]> = {
  '2h': ['day', 'h1'],
  '2v': ['day', 'h1'],
  '4': ['week', 'day', '4h', 'h1'],
};

export interface StoredGrid {
  layout: GridLayout;
  tfs: Record<MultiLayout, ChartTf[]>;
}

const TF_KEYS = new Set<string>(TF_OPTIONS.map((o) => o.key));

/**
 * A stable name for each chart: its timeframe, numbered when two charts share one. Keyed by
 * it, a chart keeps its zoom, drawings and candles when it moves to another place.
 */
export function cellKeys(tfs: ChartTf[]): string[] {
  const seen = new Map<ChartTf, number>();
  return tfs.map((tf) => {
    const n = seen.get(tf) ?? 0;
    seen.set(tf, n + 1);
    return n === 0 ? tf : `${tf}#${n}`;
  });
}

export function cellCount(layout: GridLayout): number {
  return layout === '4' ? 4 : layout === '1' ? 1 : 2;
}

/** Shorter period first; used to tell which of two charts has the finer candles. */
export function tfRank(tf: ChartTf): number {
  return TF_OPTIONS.findIndex((o) => o.key === tf);
}

function sanitizeCells(raw: unknown, layout: MultiLayout): ChartTf[] {
  const fallback = DEFAULT_GRID_TFS[layout];
  const picked = Array.isArray(raw) ? raw : [];
  return fallback.map((tf, i) =>
    typeof picked[i] === 'string' && TF_KEYS.has(picked[i]) ? (picked[i] as ChartTf) : tf,
  );
}

export function sanitizeGrid(raw: unknown): StoredGrid {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as {
    layout?: unknown;
    tfs?: Partial<Record<MultiLayout, unknown>>;
  };
  const layout = GRID_LAYOUTS.includes(value.layout as GridLayout)
    ? (value.layout as GridLayout)
    : '1';
  const tfs = value.tfs ?? {};
  return {
    layout,
    tfs: {
      '2h': sanitizeCells(tfs['2h'], '2h'),
      '2v': sanitizeCells(tfs['2v'], '2v'),
      '4': sanitizeCells(tfs['4'], '4'),
    },
  };
}

function loadGrid(): StoredGrid {
  const raw = readStorage(GRID_STORAGE_KEY);
  try {
    return sanitizeGrid(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeGrid(null);
  }
}

// One copy for every chart page: the live page and an analysis page of the same stock stay
// mounted together, and each keeping its own copy let one overwrite the other's choice.
let current: StoredGrid | null = null;
const listeners = new Set<() => void>();

function gridSnapshot(): StoredGrid {
  current ??= loadGrid();
  return current;
}

function updateGrid(update: (prev: StoredGrid) => StoredGrid): void {
  const next = update(gridSnapshot());
  if (next === current) return;
  current = next;
  writeStorage(GRID_STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

function subscribeGrid(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests start each case from what storage holds. */
export function resetChartGridStore(): void {
  current = null;
}

export interface ChartGridState {
  layout: GridLayout;
  setLayout: (layout: GridLayout) => void;
  /** Each chart's timeframe, in slot order. */
  tfs: ChartTf[];
  activeCell: number;
  selectCell: (index: number) => void;
  setCellTf: (index: number, tf: ChartTf) => void;
  /** Trade two charts' places (a chart dragged onto another). */
  swapCells: (from: number, to: number) => void;
  maximized: number | null;
  toggleMaximize: (index: number) => void;
  /** The timeframe the page follows: the selected chart's in a grid, the page's own otherwise. */
  tf: ChartTf | null;
  /** What the toolbar's timeframe switch does: changes the selected chart in a grid. */
  setTf: (tf: ChartTf) => void;
}

/**
 * The chart grid's layout and timeframes are remembered across stocks and restarts; which
 * chart is selected or enlarged lasts only while the page is open.
 */
export function useChartGrid(
  pageTf: ChartTf | null,
  setPageTf: (tf: ChartTf) => void,
): ChartGridState {
  const stored = useSyncExternalStore(subscribeGrid, gridSnapshot, gridSnapshot);
  const [activeCell, setActiveCell] = useState(0);
  const [maximized, setMaximized] = useState<number | null>(null);
  const { layout } = stored;
  const tfs = layout === '1' ? [] : stored.tfs[layout];
  const cell = Math.min(activeCell, Math.max(0, tfs.length - 1));

  const setLayout = useCallback(
    (next: GridLayout) => {
      if (next === layout) return;
      setMaximized(null);
      // Whatever chart is selected carries on: into the single chart, or onto the chart of
      // the new grid that shows the same timeframe.
      const keep = (layout === '1' ? pageTf : tfs[cell]) ?? DEFAULT_CHART_TF;
      if (next === '1') {
        setPageTf(keep);
      } else {
        const at = gridSnapshot().tfs[next].indexOf(keep);
        setActiveCell(at >= 0 ? at : 0);
      }
      updateGrid((prev) => ({ ...prev, layout: next }));
    },
    [layout, tfs, cell, pageTf, setPageTf],
  );

  const setCellTf = useCallback((index: number, tf: ChartTf) => {
    updateGrid((prev) => {
      if (prev.layout === '1' || prev.tfs[prev.layout][index] === tf) return prev;
      const nextTfs = prev.tfs[prev.layout].map((t, i) => (i === index ? tf : t));
      return { ...prev, tfs: { ...prev.tfs, [prev.layout]: nextTfs } };
    });
  }, []);

  const swapCells = useCallback((from: number, to: number) => {
    if (from === to) return;
    let swapped = false;
    updateGrid((prev) => {
      if (prev.layout === '1') return prev;
      const cells = prev.tfs[prev.layout];
      if (from < 0 || to < 0 || from >= cells.length || to >= cells.length) return prev;
      swapped = true;
      const next = cells.map((t, i) => (i === from ? cells[to] : i === to ? cells[from] : t));
      return { ...prev, tfs: { ...prev.tfs, [prev.layout]: next } };
    });
    // The selection travels with the chart that moved.
    if (swapped) setActiveCell((now) => (now === from ? to : now === to ? from : now));
  }, []);

  const toggleMaximize = useCallback((index: number) => {
    setActiveCell(index);
    setMaximized((now) => (now === index ? null : index));
  }, []);

  const setTf = useCallback(
    (tf: ChartTf) => {
      if (layout === '1') setPageTf(tf);
      else setCellTf(cell, tf);
    },
    [layout, cell, setCellTf, setPageTf],
  );

  return {
    layout,
    setLayout,
    tfs,
    activeCell: cell,
    selectCell: setActiveCell,
    setCellTf,
    swapCells,
    maximized: layout === '1' ? null : maximized,
    toggleMaximize,
    tf: layout === '1' ? pageTf : (tfs[cell] ?? pageTf),
    setTf,
  };
}

function lastAtOrBefore(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// The overnight session opens at 20:00 ET and trades for the next day, whose daily candle is
// stamped at midnight ET: an intraday candle belongs to the day of its time plus 4 hours.
const OVERNIGHT_LEAD_S = 4 * 3600;

/** How far intraday times move forward to line up with day / week / month candles. */
export function sessionShift(a: ChartTf, b: ChartTf): number {
  return isSessionlessTf(a) === isSessionlessTf(b) ? 0 : OVERNIGHT_LEAD_S;
}

const SPAN_S: Record<Exclude<ChartTf, 'month'>, number> = {
  '1m': 60,
  'm5': 300,
  'm15': 900,
  '30m': 1800,
  'h1': 3600,
  '4h': 4 * 3600,
  'day': 86_400,
  'week': 7 * 86_400,
};

/**
 * When a candle that opens at `time` closes. Only needed for a chart's newest candle: every
 * other candle ends where the next one starts.
 */
export function barEnd(time: number, tf: ChartTf): number {
  if (tf !== 'month') return time + SPAN_S[tf];
  // Monthly candles open at local midnight on the 1st. In UTC that is still the last day of
  // the previous month for markets east of UTC (Hong Kong, China), so read the month half a
  // day later.
  const d = new Date((time + 12 * 3600) * 1000);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return time + (next - start) / 1000;
}

/** One chart's candle open times, in order, and its timeframe. */
export interface GridSeries {
  times: number[];
  tf: ChartTf;
}

/**
 * The candle in another chart that matches the hovered one. A chart with longer candles
 * marks the candle containing the hovered moment; a chart with shorter candles marks its last
 * candle inside the hovered one (where that candle closed). Returns the candle's index, or
 * null when the other chart has no candle there (its history starts later, or its newest
 * candle ended before the hovered moment).
 */
export function matchingBarIndex(src: GridSeries, time: number, dst: GridSeries): number | null {
  const srcIndex = lastAtOrBefore(src.times, time);
  if (srcIndex < 0) return null;
  const shift = sessionShift(src.tf, dst.tf);
  const start = src.times[srcIndex];
  if (tfRank(dst.tf) >= tfRank(src.tf)) {
    const moment = start + shift;
    const at = lastAtOrBefore(dst.times, moment);
    if (at < 0) return null;
    const end = dst.times[at + 1] ?? barEnd(dst.times[at], dst.tf);
    return moment < end ? at : null;
  }
  const end = src.times[srcIndex + 1] ?? barEnd(start, src.tf);
  const at = lastAtOrBefore(dst.times, end - shift - 1);
  return at >= 0 && dst.times[at] + shift >= start ? at : null;
}
