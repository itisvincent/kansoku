import { describe, expect, it } from 'vitest';
import {
  callStartTs,
  computeIntradayEntryPlan,
  resolveEntryPlanStatus,
} from '../src/analysis/intraday/entryPlan.js';
import { addRow, emptyBucket, finalize } from '../src/cockpit/stats.js';

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('computeIntradayEntryPlan', () => {
  it('measures reward-to-risk to the first target, not a filled-in second one', () => {
    const plan = computeIntradayEntryPlan({ entry: 100, stop: 98, target1: 102.5 }, 'long');
    expect(plan.rr).toBeCloseTo(1.25);
    expect(plan.rr_ok).toBe(false);
  });

  it('passes a plan that meets the 1.5:1 floor', () => {
    const plan = computeIntradayEntryPlan({ entry: 100, stop: 110, target1: 85 }, 'short');
    expect(plan.rr).toBeCloseTo(1.5);
    expect(plan.rr_ok).toBe(true);
  });

  it('does not turn a null target into a $0 target', () => {
    const raw = { entry: 100, stop: 98, target1: null, target2: null } as unknown as Parameters<
      typeof computeIntradayEntryPlan
    >[0];
    const plan = computeIntradayEntryPlan(raw, 'long');
    expect(plan.target1).toBeCloseTo(103);
    expect(plan.target2).toBeCloseTo(106);
  });
});

describe('entry status only looks at bars after the call', () => {
  const candles = [
    { time: sec('2026-07-01T13:30:00Z'), high: 101, low: 97, close: 98 }, // dip to entry at the open
    { time: sec('2026-07-01T19:00:00Z'), high: 101, low: 99.5, close: 100 },
  ];
  const plan = { entry: 98, stop: 95 };

  it('uses the time the call was made when it is known', () => {
    const from = callStartTs('2026-07-01T13:30:00Z', '2026-07-01T19:00:00Z');
    expect(from).toBe(sec('2026-07-01T19:00:00Z'));
    expect(resolveEntryPlanStatus(plan, 'long', from, candles)?.status).toBe('waiting');
  });

  it('falls back to the anchor bar for older predictions', () => {
    const from = callStartTs('2026-07-01T13:30:00Z', undefined);
    expect(from).toBe(sec('2026-07-01T13:30:00Z'));
    expect(resolveEntryPlanStatus(plan, 'long', from, candles)?.status).toBe('triggered');
  });
});

describe('average return of resolved calls', () => {
  it('counts a short that fell as a gain and leaves range calls out', () => {
    const bucket = emptyBucket();
    addRow(bucket, { status: 'hit_target', pct_since_anchor: -4, resolved_at: 1 }, 'short');
    addRow(bucket, { status: 'hit_stop', pct_since_anchor: -2, resolved_at: 1 }, 'long');
    addRow(bucket, { status: 'held_range', pct_since_anchor: 9, resolved_at: 1 }, 'neutral');
    expect(finalize(bucket).avg_pct).toBeCloseTo(1);
  });
});
