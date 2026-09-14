import type { SeriesMarker } from '@kansoku/shared/types';

export interface IndicatorSignalCopy {
  rsiOverbought: string;
  rsiOversold: string;
  rsiCrossUp: string;
  rsiCrossDown: string;
  bollBreakUp: string;
  bollBreakDown: string;
}

const SIGNAL_COLOR = {
  bullish: '#26a69a',
  bearish: '#ef5350',
} as const;

function crossing(prev: number, current: number, level: number): 'up' | 'down' | null {
  if (prev <= level && current > level) return 'up';
  if (prev >= level && current < level) return 'down';
  return null;
}

export function rsiSignalMarkers(
  times: number[],
  values: (number | null)[],
  copy: IndicatorSignalCopy,
): SeriesMarker[] {
  const markers: SeriesMarker[] = [];
  for (let i = 1; i < Math.min(times.length, values.length); i++) {
    const prev = values[i - 1];
    const current = values[i];
    if (prev === null || current === null) continue;

    const overbought = crossing(prev, current, 70);
    if (overbought === 'up') {
      markers.push({
        id: `rsi-overbought-${times[i]}`,
        time: times[i],
        position: 'aboveBar',
        color: SIGNAL_COLOR.bearish,
        shape: 'arrowDown',
        text: '70↑',
        tooltip: copy.rsiOverbought,
        group: 'indicator',
      });
    }

    const oversold = crossing(prev, current, 30);
    if (oversold === 'down') {
      markers.push({
        id: `rsi-oversold-${times[i]}`,
        time: times[i],
        position: 'belowBar',
        color: SIGNAL_COLOR.bullish,
        shape: 'arrowUp',
        text: '30↓',
        tooltip: copy.rsiOversold,
        group: 'indicator',
      });
    }

    const midpoint = crossing(prev, current, 50);
    if (midpoint) {
      const bullish = midpoint === 'up';
      markers.push({
        id: `rsi-mid-${midpoint}-${times[i]}`,
        time: times[i],
        position: bullish ? 'belowBar' : 'aboveBar',
        color: bullish ? SIGNAL_COLOR.bullish : SIGNAL_COLOR.bearish,
        shape: bullish ? 'arrowUp' : 'arrowDown',
        text: bullish ? '50↑' : '50↓',
        tooltip: bullish ? copy.rsiCrossUp : copy.rsiCrossDown,
        group: 'indicator',
      });
    }
  }
  return markers;
}

export function bollingerSignalMarkers(
  times: number[],
  closes: number[],
  upper: (number | null)[],
  lower: (number | null)[],
  copy: IndicatorSignalCopy,
): SeriesMarker[] {
  const markers: SeriesMarker[] = [];
  const length = Math.min(times.length, closes.length, upper.length, lower.length);
  for (let i = 1; i < length; i++) {
    const previousUpper = upper[i - 1];
    const currentUpper = upper[i];
    const previousLower = lower[i - 1];
    const currentLower = lower[i];
    if (
      previousUpper !== null &&
      currentUpper !== null &&
      closes[i - 1] <= previousUpper &&
      closes[i] > currentUpper
    ) {
      markers.push({
        id: `boll-break-up-${times[i]}`,
        time: times[i],
        position: 'belowBar',
        color: SIGNAL_COLOR.bullish,
        shape: 'arrowUp',
        text: 'B↑',
        tooltip: copy.bollBreakUp,
        group: 'indicator',
      });
    }
    if (
      previousLower !== null &&
      currentLower !== null &&
      closes[i - 1] >= previousLower &&
      closes[i] < currentLower
    ) {
      markers.push({
        id: `boll-break-down-${times[i]}`,
        time: times[i],
        position: 'aboveBar',
        color: SIGNAL_COLOR.bearish,
        shape: 'arrowDown',
        text: 'B↓',
        tooltip: copy.bollBreakDown,
        group: 'indicator',
      });
    }
  }
  return markers;
}
