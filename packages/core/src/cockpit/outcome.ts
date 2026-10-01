import type {
  AnalysisOutcome,
  IntradayPrediction,
  OutcomeStatus,
  RawBar,
} from '@kansoku/shared/types';

export interface OutcomePlan {
  entry?: number;
  stop?: number;
  target1?: number;
}

export interface OutcomeAnchor {
  /** Start time of the bar the call was based on. */
  time: string;
  price: number;
  /**
   * When the analysis was made (the chart's created_at). The anchor bar may still have been
   * forming then, and on a day or hourly anchor many smaller bars inside it happened before
   * the call; only bars starting at or after this moment may settle it.
   */
  madeAt?: string | null;
}

// A neutral (range-bound) call resolves to held_range after one full regular session
// (6.5h) of trading time after the call without a close outside the zone. Trading time is
// counted in bars, so nights and weekends do not count.
const NEUTRAL_HELD_HORIZON_SEC = 6.5 * 3600;

function toSec(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export function zoneFromPrediction(
  prediction: Pick<IntradayPrediction, 'range_bound_plan' | 'range_plan'> | null | undefined,
): { low: number; high: number } | null {
  const rp = prediction?.range_bound_plan ?? prediction?.range_plan;
  const low = Number(rp?.low);
  const high = Number(rp?.high);
  return Number.isFinite(low) && Number.isFinite(high) && low < high ? { low, high } : null;
}

export function rMultipleFor(
  status: OutcomeStatus,
  direction: 'long' | 'short' | 'neutral',
  plan: OutcomePlan | null | undefined,
): number | null {
  if (direction === 'neutral' || !plan) return null;
  const { entry, stop, target1 } = plan;
  if (entry === undefined || stop === undefined || target1 === undefined) return null;
  const risk = direction === 'long' ? entry - stop : stop - entry;
  if (!(risk > 0)) return null;
  if (status === 'hit_stop') return -1;
  if (status === 'hit_target') {
    const reward = direction === 'long' ? target1 - entry : entry - target1;
    return reward / risk;
  }
  return null;
}

export function attachRMultiple(
  outcome: AnalysisOutcome | null,
  direction: 'long' | 'short' | 'neutral' | null,
  plan: OutcomePlan | null | undefined,
): AnalysisOutcome | null {
  if (!outcome || !direction) return outcome;
  if (outcome.r_multiple != null) return outcome;
  return { ...outcome, r_multiple: rMultipleFor(outcome.status, direction, plan) };
}

/** A usable level: a finite, positive price (a missing target must not read as 0). */
function level(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function covers(fromSec: number, bars: RawBar[]): boolean {
  if (bars.length === 0) return true;
  const firstSec = toSec(bars[0].time);
  if (firstSec <= fromSec) return true;
  const tolerance = bars.length > 1 ? Math.max(0, toSec(bars[1].time) - firstSec) : Infinity;
  return firstSec - fromSec <= tolerance;
}

/** The usual gap between bars, used as one bar's length. */
function barSeconds(bars: RawBar[]): number {
  let best = Infinity;
  for (let i = 1; i < bars.length; i++) {
    const gap = toSec(bars[i].time) - toSec(bars[i - 1].time);
    if (gap > 0 && gap < best) best = gap;
  }
  return Number.isFinite(best) ? best : 900;
}

function pctMove(price: number, anchorPrice: number): number {
  return (price / anchorPrice - 1) * 100;
}

function judgeRange(
  anchor: OutcomeAnchor,
  zone: { low: number; high: number },
  following: RawBar[],
  barLen: number,
): AnalysisOutcome {
  if (following.length === 0) return { status: 'open', pct_since_anchor: 0, resolved_at: null };
  for (let i = 0; i < following.length; i++) {
    const bar = following[i];
    const close = Number(bar.close);
    const pct = pctMove(close, anchor.price);
    // Close-based break so a single wick poke doesn't fail the call.
    if (close > zone.high || close < zone.low) {
      return { status: 'broke_range', pct_since_anchor: pct, resolved_at: toSec(bar.time) };
    }
    if ((i + 1) * barLen >= NEUTRAL_HELD_HORIZON_SEC) {
      return { status: 'held_range', pct_since_anchor: pct, resolved_at: toSec(bar.time) };
    }
  }
  return {
    status: 'open',
    pct_since_anchor: pctMove(Number(following.at(-1)!.close), anchor.price),
    resolved_at: null,
  };
}

function judgeTrade(
  direction: 'long' | 'short',
  anchor: OutcomeAnchor,
  plan: { entry: number | undefined; stop: number; target1: number },
  following: RawBar[],
): AnalysisOutcome {
  if (following.length === 0) return { status: 'open', pct_since_anchor: 0, resolved_at: null };
  const { stop, target1 } = plan;
  const entry = plan.entry ?? anchor.price;
  // The entry fills when price reaches it from where the call was made: a buy above the
  // price fills on a rise to it, a buy below on a dip to it (and the mirror for shorts).
  const entryAbove = entry >= anchor.price;
  // Inside the bar that fills the entry, the target counts only when price had to pass the
  // entry on its way to the target; otherwise the order inside that bar is unknown.
  const fillThenTargetInOrder =
    direction === 'long' ? entryAbove && target1 > entry : !entryAbove && target1 < entry;
  const resolved = (status: 'hit_stop' | 'hit_target', price: number, bar: RawBar) => ({
    status,
    pct_since_anchor: pctMove(price, anchor.price),
    resolved_at: toSec(bar.time),
    r_multiple: rMultipleFor(status, direction, { entry, stop, target1 }),
  });

  let filled = plan.entry === undefined;
  for (const bar of following) {
    const high = Number(bar.high);
    const low = Number(bar.low);
    const hitStop = direction === 'long' ? low <= stop : high >= stop;
    const hitTarget = direction === 'long' ? high >= target1 : low <= target1;
    if (!filled) {
      // Reaching the stop before the entry fills means the call was wrong.
      if (hitStop) return resolved('hit_stop', stop, bar);
      filled = entryAbove ? high >= entry : low <= entry;
      if (filled && hitTarget && fillThenTargetInOrder) return resolved('hit_target', target1, bar);
      continue;
    }
    // Same-bar collision: when both stop and target trigger inside one bar, the stop is
    // assumed to have been touched first (conservative).
    if (hitStop) return resolved('hit_stop', stop, bar);
    if (hitTarget) return resolved('hit_target', target1, bar);
  }

  return {
    status: 'open',
    pct_since_anchor: pctMove(Number(following.at(-1)!.close), anchor.price),
    resolved_at: null,
  };
}

/**
 * Settles a call against the bars that came after it. Returns null when the call cannot be
 * judged (no plan or zone, or the bars no longer reach back to when it was made).
 */
export function judgeOutcome(
  direction: 'long' | 'short' | 'neutral',
  anchor: OutcomeAnchor,
  plan: OutcomePlan | null,
  bars: RawBar[],
  zone?: { low: number; high: number } | null,
): AnalysisOutcome | null {
  const anchorSec = toSec(anchor.time);
  const madeSec = anchor.madeAt ? toSec(anchor.madeAt) : NaN;
  const fromSec = Number.isFinite(madeSec) ? Math.max(anchorSec, madeSec) : anchorSec;
  const after = (bar: RawBar) => {
    const sec = toSec(bar.time);
    return sec > anchorSec && sec >= fromSec;
  };

  if (direction === 'neutral') {
    if (!zone || !covers(fromSec, bars)) return null;
    return judgeRange(anchor, zone, bars.filter(after), barSeconds(bars));
  }

  const stop = level(plan?.stop);
  const target1 = level(plan?.target1);
  if (stop === undefined || target1 === undefined) return null;
  if (!covers(fromSec, bars)) return null;
  return judgeTrade(
    direction,
    anchor,
    { entry: level(plan?.entry), stop, target1 },
    bars.filter(after),
  );
}
