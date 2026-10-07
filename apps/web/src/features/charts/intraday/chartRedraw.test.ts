import { describe, expect, it } from 'vitest';
import type { IntradayBuilt, IntradayTfData } from '@kansoku/shared/types';
import { isLastBarTick, sameChartInputs, sameTfData } from './chartRedraw';
import { applyLiveQuote } from './useLiveBuilt';

const candle = (time: number, close: number) => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
});

const tfData = (closes: number[]): IntradayTfData =>
  ({
    candles: closes.map((c, i) => candle(i * 60, c)),
    volumes: [],
    markers: [],
    macdDif: [],
    macdDea: [],
    macdHist: [],
    macdCrossMarkers: [],
  }) as unknown as IntradayTfData;

const doc = (week: IntradayTfData, m5: IntradayTfData, entry = 100): IntradayBuilt =>
  ({
    timeframes: { week, m5 },
    sidebar: { prediction: null, dayContext: { prev_day: { high: 1 } }, optionsLevels: null },
    entryPlan: { entry, stop: 90 },
    previewLevels: undefined,
  }) as unknown as IntradayBuilt;

describe('sameChartInputs', () => {
  const week = tfData([1, 2, 3]);

  it('ignores a push that only changed another timeframe', () => {
    const before = doc(week, tfData([1]));
    const after = doc(week, tfData([1, 2]));
    expect(sameChartInputs(before, after, 'week')).toBe(true);
    expect(sameChartInputs(before, after, 'm5')).toBe(false);
  });

  it('ignores the live VWAP moving in the day context, but not the day levels', () => {
    const m5 = tfData([1]);
    const withDay = (day: object) => {
      const d = doc(week, m5);
      return { ...d, sidebar: { ...d.sidebar, dayContext: day } } as IntradayBuilt;
    };
    const before = withDay({ prev_day: { high: 1 }, vwap: 10 });
    expect(sameChartInputs(before, withDay({ prev_day: { high: 1 }, vwap: 11 }), 'week')).toBe(true);
    expect(sameChartInputs(before, withDay({ prev_day: { high: 2 }, vwap: 10 }), 'week')).toBe(false);
  });

  it("redraws when the chart's own candles or its plan lines change", () => {
    const m5 = tfData([1]);
    expect(sameChartInputs(doc(week, m5), doc(tfData([1, 2, 3]), m5), 'week')).toBe(false);
    expect(sameChartInputs(doc(week, m5), doc(week, m5, 101), 'week')).toBe(false);
  });
});

describe('isLastBarTick', () => {
  it('spots a live price moving the newest candle', () => {
    const before = tfData([1, 2, 3]);
    const ticked = applyLiveQuote(before, 3.5);
    expect(isLastBarTick(before, ticked)).toBe(true);
    expect(isLastBarTick(ticked, applyLiveQuote(ticked, 3.6))).toBe(true);
  });

  it('wants a full redraw for anything else', () => {
    const before = tfData([1, 2, 3]);
    expect(isLastBarTick(before, before)).toBe(false);
    // A refetch: same prices, new objects.
    expect(isLastBarTick(before, tfData([1, 2, 3.5]))).toBe(false);
    // A new candle.
    const longer = { ...before, candles: [...before.candles, candle(180, 4)] };
    expect(isLastBarTick(before, longer)).toBe(false);
    // The same candles with new markers.
    const marked = { ...applyLiveQuote(before, 3.5), markers: [] };
    expect(isLastBarTick(before, marked)).toBe(false);
  });
});

describe('sameTfData', () => {
  it('compares a refetch by content', () => {
    expect(sameTfData(tfData([1, 2]), tfData([1, 2]))).toBe(true);
    expect(sameTfData(tfData([1, 2]), tfData([1, 3]))).toBe(false);
    expect(sameTfData(null, tfData([1]))).toBe(false);
  });
});
