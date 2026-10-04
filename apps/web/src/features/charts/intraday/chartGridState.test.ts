// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  barEnd,
  cellCount,
  cellKeys,
  DEFAULT_GRID_TFS,
  GRID_STORAGE_KEY,
  matchingBarIndex,
  resetChartGridStore,
  sanitizeGrid,
  sessionShift,
  tfRank,
  useChartGrid,
} from './chartGridState';
import type { ChartTf } from './timeframes';

afterEach(() => {
  localStorage.clear();
  resetChartGridStore();
});

const HOUR = 3600;
const DAY = 86_400;

describe('sanitizeGrid', () => {
  it('starts as one chart with the default timeframes', () => {
    expect(sanitizeGrid(null)).toEqual({ layout: '1', tfs: DEFAULT_GRID_TFS });
    expect(sanitizeGrid('junk')).toEqual({ layout: '1', tfs: DEFAULT_GRID_TFS });
  });

  it('keeps valid entries and replaces bad ones slot by slot', () => {
    const grid = sanitizeGrid({ layout: '4', tfs: { '4': ['month', 'bogus', 7], '2h': ['m5'] } });
    expect(grid.layout).toBe('4');
    expect(grid.tfs['4']).toEqual(['month', 'day', '4h', 'h1']);
    expect(grid.tfs['2h']).toEqual(['m5', 'h1']);
    expect(grid.tfs['2v']).toEqual(DEFAULT_GRID_TFS['2v']);
  });

  it('drops an unknown layout', () => {
    expect(sanitizeGrid({ layout: '9' }).layout).toBe('1');
  });
});

describe('cellKeys', () => {
  it('names each chart by its timeframe, numbering repeats', () => {
    expect(cellKeys(['week', 'day', 'day', 'h1'])).toEqual(['week', 'day', 'day#1', 'h1']);
  });

  it('gives a chart the same name wherever it sits', () => {
    expect(cellKeys(['h1', 'day'])).toEqual(['h1', 'day']);
  });
});

describe('cellCount and tfRank', () => {
  it('counts the charts in each layout', () => {
    expect([cellCount('1'), cellCount('2h'), cellCount('2v'), cellCount('4')]).toEqual([1, 2, 2, 4]);
  });

  it('orders timeframes from short to long', () => {
    expect(tfRank('m5')).toBeLessThan(tfRank('h1'));
    expect(tfRank('h1')).toBeLessThan(tfRank('day'));
    expect(tfRank('day')).toBeLessThan(tfRank('week'));
  });
});

describe('matchingBarIndex', () => {
  // Three daily candles, and hourly candles for the middle day only.
  const days = { times: [0, DAY, 2 * DAY], tf: 'day' as const };
  const hours = { times: [DAY + 14 * HOUR, DAY + 15 * HOUR, DAY + 16 * HOUR], tf: 'h1' as const };

  it('marks the longer candle that contains the hovered one', () => {
    expect(matchingBarIndex(hours, hours.times[1], days)).toBe(1);
  });

  it('marks the last shorter candle inside the hovered one', () => {
    expect(matchingBarIndex(days, DAY, hours)).toBe(2);
  });

  it('marks the newest shorter candle when the hovered candle is the latest', () => {
    const withToday = { ...hours, times: [...hours.times, 2 * DAY + 14 * HOUR] };
    expect(matchingBarIndex(days, 2 * DAY, withToday)).toBe(3);
  });

  it('marks nothing where the other chart has no candle', () => {
    expect(matchingBarIndex(days, 0, hours)).toBeNull();
    expect(matchingBarIndex(hours, hours.times[0], { times: [5 * DAY], tf: 'day' })).toBeNull();
  });

  it('finds the hovered candle from any moment inside it', () => {
    expect(matchingBarIndex(days, DAY + 3 * HOUR, hours)).toBe(2);
  });

  it('matches equal timeframes one to one', () => {
    expect(matchingBarIndex(hours, hours.times[2], hours)).toBe(2);
  });

  describe('a chart’s newest candle', () => {
    // A frozen view leaves out the week still trading, so the newest weekly candle can end
    // before the hourly chart does.
    const week = { times: [0], tf: 'week' as const };
    const hourly = { times: [DAY + 10 * HOUR, 4 * DAY + 15 * HOUR, 8 * DAY + 10 * HOUR], tf: 'h1' as const };

    it('is not marked for a moment after it closed', () => {
      expect(matchingBarIndex(hourly, hourly.times[2], week)).toBeNull();
      expect(matchingBarIndex(hourly, hourly.times[1], week)).toBe(0);
    });

    it('marks only shorter candles inside it', () => {
      expect(matchingBarIndex(week, 0, hourly)).toBe(1);
    });
  });

  describe('overnight trading belongs to the next day', () => {
    // Daily candles are stamped at midnight ET; the overnight session opens at 20:00 ET
    // the evening before. Friday, then Monday; hourly candles from Friday's after-hours
    // through Sunday night's overnight session.
    const friday = 4 * DAY;
    const monday = 7 * DAY;
    const daily = { times: [friday, monday], tf: 'day' as const };
    const hourly = {
      times: [friday + 19 * HOUR, monday - 4 * HOUR, monday - HOUR, monday + 10 * HOUR],
      tf: 'h1' as const,
    };

    it('marks Friday’s last after-hours candle for Friday, not Sunday night', () => {
      expect(matchingBarIndex(daily, friday, hourly)).toBe(0);
    });

    it('marks Monday for a Sunday-night overnight candle', () => {
      expect(matchingBarIndex(hourly, hourly.times[1], daily)).toBe(1);
      expect(matchingBarIndex(hourly, hourly.times[0], daily)).toBe(0);
    });

    it('applies only between intraday and day-or-longer charts', () => {
      expect(sessionShift('h1', '4h')).toBe(0);
      expect(sessionShift('day', 'week')).toBe(0);
      expect(sessionShift('week', 'm15')).toBe(4 * HOUR);
    });
  });
});

describe('barEnd', () => {
  it('ends a candle one period after it opens', () => {
    expect(barEnd(0, 'h1')).toBe(HOUR);
    expect(barEnd(0, 'week')).toBe(7 * DAY);
  });

  it('ends a monthly candle at the next month', () => {
    const sep1 = Date.UTC(2026, 8, 1, 4) / 1000;
    expect(barEnd(sep1, 'month')).toBe(Date.UTC(2026, 9, 1, 4) / 1000);
  });

  it('ends a Hong Kong monthly candle at the end of its own month', () => {
    // 1 March, midnight in Hong Kong, is still 28 February in UTC.
    const mar1Hk = Date.UTC(2026, 1, 28, 16) / 1000;
    expect(barEnd(mar1Hk, 'month')).toBe(Date.UTC(2026, 2, 31, 16) / 1000);
  });
});

describe('useChartGrid', () => {
  function setup(pageTf: ChartTf | null = 'h1') {
    const setPageTf = vi.fn();
    const hook = renderHook(({ tf }) => useChartGrid(tf, setPageTf), {
      initialProps: { tf: pageTf },
    });
    return { ...hook, setPageTf };
  }

  it('follows the page timeframe as one chart', () => {
    const { result, setPageTf } = setup('4h');
    expect(result.current.layout).toBe('1');
    expect(result.current.tfs).toEqual([]);
    expect(result.current.tf).toBe('4h');
    act(() => result.current.setTf('day'));
    expect(setPageTf).toHaveBeenCalledWith('day');
  });

  it('selects the chart already showing the page timeframe when it opens a grid', () => {
    const { result } = setup('h1');
    act(() => result.current.setLayout('4'));
    expect(result.current.tfs).toEqual(['week', 'day', '4h', 'h1']);
    expect(result.current.activeCell).toBe(3);
    expect(result.current.tf).toBe('h1');
  });

  it('points the toolbar switch at the selected chart, and remembers it', () => {
    const { result, setPageTf } = setup('h1');
    act(() => result.current.setLayout('4'));
    act(() => result.current.selectCell(1));
    act(() => result.current.setTf('month'));
    expect(result.current.tfs).toEqual(['week', 'month', '4h', 'h1']);
    expect(result.current.tf).toBe('month');
    expect(setPageTf).not.toHaveBeenCalled();
    const saved = JSON.parse(localStorage.getItem(GRID_STORAGE_KEY) ?? '{}');
    expect(saved).toMatchObject({ layout: '4', tfs: { '4': ['week', 'month', '4h', 'h1'] } });
  });

  it('hands the selected chart’s timeframe back to the single chart', () => {
    const { result, setPageTf } = setup('h1');
    act(() => result.current.setLayout('2h'));
    act(() => result.current.selectCell(0));
    act(() => result.current.setLayout('1'));
    expect(setPageTf).toHaveBeenCalledWith('day');
  });

  it('enlarges one chart and restores the grid', () => {
    const { result } = setup('h1');
    act(() => result.current.setLayout('4'));
    act(() => result.current.toggleMaximize(2));
    expect(result.current.maximized).toBe(2);
    expect(result.current.activeCell).toBe(2);
    act(() => result.current.toggleMaximize(2));
    expect(result.current.maximized).toBeNull();
  });

  it('opens a grid from a fresh page on the default 4-hour chart', () => {
    const { result } = setup(null);
    act(() => result.current.setLayout('4'));
    expect(result.current.activeCell).toBe(2);
    expect(result.current.tf).toBe('4h');
  });

  it('keeps the selected chart’s timeframe when switching between grids', () => {
    const { result } = setup('h1');
    act(() => result.current.setLayout('2h'));
    act(() => result.current.selectCell(0));
    act(() => result.current.setLayout('4'));
    expect(result.current.tf).toBe('day');
    expect(result.current.activeCell).toBe(1);
  });

  it('shares one layout between pages that are open together', () => {
    const live = setup('h1');
    const analysis = setup('h1');
    act(() => live.result.current.setLayout('4'));
    expect(analysis.result.current.layout).toBe('4');
    act(() => analysis.result.current.setCellTf(0, 'month'));
    expect(live.result.current.tfs[0]).toBe('month');
  });

  it('keeps both changes when two charts change in the same moment', () => {
    const { result } = setup('h1');
    act(() => result.current.setLayout('4'));
    act(() => {
      result.current.setCellTf(0, 'm5');
      result.current.setCellTf(3, 'm15');
    });
    expect(result.current.tfs).toEqual(['m5', 'day', '4h', 'm15']);
  });

  it('swaps two charts, remembers it, and keeps the moved chart selected', () => {
    const { result } = setup('h1');
    act(() => result.current.setLayout('4'));
    act(() => result.current.selectCell(0));
    act(() => result.current.swapCells(0, 3));
    expect(result.current.tfs).toEqual(['h1', 'day', '4h', 'week']);
    expect(result.current.activeCell).toBe(3);
    expect(result.current.tf).toBe('week');
    const saved = JSON.parse(localStorage.getItem(GRID_STORAGE_KEY) ?? '{}');
    expect(saved.tfs['4']).toEqual(['h1', 'day', '4h', 'week']);
  });

  it('moves the selection off a chart that another one was dropped onto', () => {
    const { result } = setup('h1');
    act(() => result.current.setLayout('4'));
    act(() => result.current.selectCell(2));
    act(() => result.current.swapCells(0, 2));
    expect(result.current.activeCell).toBe(0);
    expect(result.current.tf).toBe('4h');
  });

  it('ignores a swap onto itself or past the layout', () => {
    const { result } = setup('h1');
    act(() => result.current.setLayout('2h'));
    act(() => result.current.swapCells(1, 1));
    act(() => result.current.swapCells(0, 3));
    expect(result.current.tfs).toEqual(['day', 'h1']);
  });

  it('opens with the remembered layout', () => {
    localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify({ layout: '2v', tfs: { '2v': ['week', 'm15'] } }));
    const { result } = setup('h1');
    expect(result.current.layout).toBe('2v');
    expect(result.current.tfs).toEqual(['week', 'm15']);
  });
});
