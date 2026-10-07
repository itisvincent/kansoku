import type { Translator } from '@web/lib/i18n';
import type { SecondBreakout, SeriesMarker } from '@kansoku/shared/types';
import { theme } from '@web/lib/theme';

/** The first candle after the anchor that traded through the entry price. */
export function firstTouchTime(
  candles: { time: number; high: number; low: number }[],
  entry: number,
  anchorTs: number | null,
): number | null {
  for (const c of candles) {
    if (anchorTs != null && c.time < anchorTs) continue;
    if (c.low <= entry && entry <= c.high) return c.time;
  }
  return null;
}

/** Marks for second-breakout setups: the first attempt, then the signal or the trigger. */
export function secondBreakoutMarkers(sbs: SecondBreakout[], tr: Translator): SeriesMarker[] {
  const markers: SeriesMarker[] = [];
  sbs.forEach((sb, i) => {
    const bullish = sb.kind === 'H2';
    const firstText = bullish ? 'H1' : 'L1';
    const attemptVerb = bullish ? tr('chartBreakAbove') : tr('chartBreakBelow');
    markers.push({
      id: `sb-${i}-first`,
      time: sb.first.time,
      position: bullish ? 'aboveBar' : 'belowBar',
      color: theme.textSecondary,
      shape: 'circle',
      text: firstText,
      tooltip: tr('sbFirstAttempt', { value1: firstText, value2: attemptVerb }),
      group: 'sb',
    });
    if (sb.status === 'forming') {
      markers.push({
        id: `sb-${i}-signal`,
        time: sb.signal.time,
        position: bullish ? 'aboveBar' : 'belowBar',
        color: theme.textSecondary,
        shape: 'circle',
        text: '',
        tooltip: tr('sbForming', { value1: attemptVerb, value2: sb.signal.price.toFixed(2) }),
        group: 'sb',
      });
    } else if (sb.trigger) {
      const extremeText = bullish ? tr('chartHigh') : tr('chartLow');
      markers.push({
        id: `sb-${i}-trigger`,
        time: sb.trigger.time,
        position: bullish ? 'belowBar' : 'aboveBar',
        color: theme.accent,
        shape: bullish ? 'arrowUp' : 'arrowDown',
        text: sb.kind,
        tooltip: tr('sbConfirmed', {
          value1: sb.kind,
          value2: extremeText,
          value3: sb.trigger.price.toFixed(2),
          value4: attemptVerb,
        }),
        group: 'sb',
      });
    }
  });
  return markers;
}
