import { describe, expect, it } from 'vitest';
import {
  bollingerSignalMarkers,
  rsiSignalMarkers,
  type IndicatorSignalCopy,
} from './indicatorSignals';

const copy: IndicatorSignalCopy = {
  rsiOverbought: 'RSI overbought',
  rsiOversold: 'RSI oversold',
  rsiCrossUp: 'RSI bullish cross',
  rsiCrossDown: 'RSI bearish cross',
  bollBreakUp: 'Bollinger breakout',
  bollBreakDown: 'Bollinger breakdown',
};

describe('intraday indicator signals', () => {
  it('marks RSI midpoint and overbought/oversold threshold crossings', () => {
    const markers = rsiSignalMarkers([1, 2, 3, 4, 5, 6, 7], [null, 40, 55, 75, 65, 45, 25], copy);

    expect(markers.map((marker) => [marker.time, marker.text, marker.tooltip])).toEqual([
      [3, '50↑', 'RSI bullish cross'],
      [4, '70↑', 'RSI overbought'],
      [6, '50↓', 'RSI bearish cross'],
      [7, '30↓', 'RSI oversold'],
    ]);
    expect(markers.every((marker) => marker.group === 'indicator')).toBe(true);
  });

  it('marks close crossings through the outer Bollinger Bands', () => {
    const markers = bollingerSignalMarkers(
      [1, 2, 3, 4, 5, 6],
      [10, 10, 10, 10, 12, 8],
      [null, null, 11, 11, 11, 11],
      [null, null, 9, 9, 9, 9],
      copy,
    );

    expect(markers.map((marker) => [marker.time, marker.text, marker.tooltip])).toEqual([
      [5, 'B↑', 'Bollinger breakout'],
      [6, 'B↓', 'Bollinger breakdown'],
    ]);
  });
});
