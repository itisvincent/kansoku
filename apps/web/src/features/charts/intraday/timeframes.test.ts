// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntradayBuilt, IntradayTfData } from '@kansoku/shared/types';
import {
  isViewPeriod,
  sanitizeAnalysisTimeframes,
  sanitizeTimeframes,
  tfDataOf,
  useVisibleTimeframes,
  withViewTimeframe,
  ANALYSIS_TFS,
  DEFAULT_ANALYSIS_TFS,
  DEFAULT_VISIBLE_TFS,
} from './timeframes';

const built = {
  timeframes: { m5: { candles: [{ time: 1 }] }, m15: {}, h1: {} },
  defaultTf: 'm15',
} as unknown as IntradayBuilt;

const viewTf = { candles: [{ time: 9 }] } as unknown as IntradayTfData;

describe('sanitizeTimeframes', () => {
  it('falls back to the default visible set when nothing valid is stored', () => {
    expect(sanitizeTimeframes([])).toEqual(DEFAULT_VISIBLE_TFS);
    expect(sanitizeTimeframes(null)).toEqual(DEFAULT_VISIBLE_TFS);
  });

  it('keeps a custom set such as 1h / 4h / daily without forcing 5m and 15m', () => {
    expect(sanitizeTimeframes(['day', 'h1', '4h'])).toEqual(['h1', '4h', 'day']);
  });

  it('drops unknown keys and orders from shortest to longest', () => {
    expect(sanitizeTimeframes(['month', 'nope', '1m', 'h1'])).toEqual(['1m', 'h1', 'month']);
  });

  it('de-duplicates repeated keys', () => {
    expect(sanitizeTimeframes(['day', 'day'])).toEqual(['day']);
  });
});

describe('isViewPeriod', () => {
  it('separates view-only periods from the analysis ones', () => {
    expect(isViewPeriod('1m')).toBe(true);
    expect(isViewPeriod('day')).toBe(true);
    expect(isViewPeriod('m5')).toBe(false);
    expect(isViewPeriod('h1')).toBe(false);
  });
});

describe('withViewTimeframe', () => {
  it('grafts view-timeframe data onto the built doc without touching the analysis ones', () => {
    const merged = withViewTimeframe(built, 'day', viewTf);

    expect(tfDataOf(merged, 'day')).toBe(viewTf);
    expect(tfDataOf(merged, 'm5')).toBe(tfDataOf(built, 'm5'));
    expect(tfDataOf(built, 'day')).toBeUndefined();
  });

  it('returns the doc untouched when there is no data yet or the tf is an analysis one', () => {
    expect(withViewTimeframe(built, 'day', null)).toBe(built);
    expect(withViewTimeframe(built, 'm5', viewTf)).toBe(built);
  });
});

describe('sanitizeAnalysisTimeframes', () => {
  it('falls back to 5m / 15m / 1h when nothing valid is stored', () => {
    expect(sanitizeAnalysisTimeframes([])).toEqual(DEFAULT_ANALYSIS_TFS);
    expect(sanitizeAnalysisTimeframes(null)).toEqual(DEFAULT_ANALYSIS_TFS);
  });

  it('accepts 1h / 4h / daily and drops extras past 3', () => {
    expect(sanitizeAnalysisTimeframes(['day', 'h1', '4h', 'week'])).toEqual(['h1', '4h', 'day']);
  });
});

describe('useVisibleTimeframes', () => {
  afterEach(() => localStorage.clear());

  it('defaults to the analysis timeframes and persists toggles', () => {
    const { result } = renderHook(() => useVisibleTimeframes());
    expect(result.current.visibleTfs).toEqual(DEFAULT_VISIBLE_TFS);
    expect(result.current.analysisTfs).toEqual(ANALYSIS_TFS);

    act(() => result.current.toggleTf('30m'));
    expect(result.current.visibleTfs).toEqual(['m5', 'm15', '30m', 'h1', '4h']);
    expect(JSON.parse(localStorage.getItem('intraday-timeframes')!)).toEqual([
      'm5',
      'm15',
      '30m',
      'h1',
      '4h',
    ]);

    act(() => result.current.toggleTf('30m'));
    expect(result.current.visibleTfs).toEqual(DEFAULT_VISIBLE_TFS);
  });

  it('lets you hide 5m / 15m and keep 1h, 4h and daily', () => {
    const { result } = renderHook(() => useVisibleTimeframes());

    act(() => result.current.toggleTf('m5'));
    act(() => result.current.toggleTf('m15'));
    act(() => result.current.toggleTf('day'));

    expect(result.current.visibleTfs).toEqual(['h1', '4h', 'day']);
  });

  it('lets you retarget analysis windows to 1h / 4h / daily', () => {
    const { result } = renderHook(() => useVisibleTimeframes());

    act(() => result.current.toggleAnalysisTf('m5'));
    act(() => result.current.toggleAnalysisTf('m15'));
    act(() => result.current.toggleAnalysisTf('4h'));
    act(() => result.current.toggleAnalysisTf('day'));

    expect(result.current.analysisTfs).toEqual(['h1', '4h', 'day']);
    expect(JSON.parse(localStorage.getItem('intraday-analysis-tfs')!)).toEqual(['h1', '4h', 'day']);
  });

  it('refuses to hide the last remaining timeframe', () => {
    localStorage.setItem('intraday-timeframes', JSON.stringify(['day']));
    const { result } = renderHook(() => useVisibleTimeframes());

    act(() => result.current.toggleTf('day'));

    expect(result.current.visibleTfs).toEqual(['day']);
  });
});
