import { describe, expect, it } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import { collectPlanAlerts, planFromDoc, type WatchPlan } from '../src/ai/personas/predictionAlerts.js';

function intradayDoc(prediction: Record<string, unknown>, entryPlan: unknown): ChartDoc {
  return {
    id: '2026-09-21-mu',
    schema_version: 2,
    type: 'intraday',
    title: 'MU',
    symbol: 'MU.US',
    created_at: '2026-09-21T14:00:00.000Z',
    updated_at: '2026-09-21T14:00:00.000Z',
    input: {},
    built: {
      kind: 'intraday',
      timeframes: {} as never,
      defaultTf: 'm5',
      entryPlan,
      sidebar: { prediction },
    },
  } as unknown as ChartDoc;
}

describe('planFromDoc', () => {
  it('collects entry-plan levels and the range box', () => {
    const plan = planFromDoc(
      intradayDoc(
        {
          direction: 'neutral',
          range_bound_plan: { low: 280, high: 300, long_tactic: 'buy low', short_tactic: 'sell high' },
        },
        { entry: 282, stop: 278, target1: 290, target2: 296 },
      ),
    );
    expect(plan?.levels.map((l) => l.key)).toEqual(['entry', 'stop', 'target1', 'target2']);
    expect(plan?.range).toEqual({ low: 280, high: 300 });
  });

  it('returns null when there is no prediction or no actionable levels', () => {
    expect(planFromDoc(intradayDoc({}, null))).toBeNull();
    const noPrediction = { ...intradayDoc({}, null), built: { kind: 'intraday', sidebar: {} } } as unknown as ChartDoc;
    expect(planFromDoc(noPrediction)).toBeNull();
  });
});

describe('collectPlanAlerts', () => {
  const plan: WatchPlan = {
    chartId: 'doc',
    createdDate: '2026-09-21',
    direction: 'neutral',
    levels: [
      { key: 'entry', label: 'Entry', value: 282 },
      { key: 'stop', label: 'Stop', value: 278 },
    ],
    range: { low: 280, high: 300 },
  };

  it('fires on upward and downward level crossings', () => {
    const events = collectPlanAlerts(281.5, 282.4, plan);
    expect(events.map((e) => e.key)).toEqual(['entry']);
    expect(events[0].text).toContain('282.00');

    const down = collectPlanAlerts(279, 277.8, plan);
    expect(down.map((e) => e.key)).toEqual(['stop']);
  });

  it('fires the range break once per side and not while inside', () => {
    expect(collectPlanAlerts(290, 292, plan)).toEqual([]);
    const above = collectPlanAlerts(299.9, 300.2, plan);
    expect(above.map((e) => e.key)).toEqual(['range']);
    expect(above[0].text).toContain('above');

    const below = collectPlanAlerts(280.1, 279.9, plan);
    expect(below.map((e) => e.key)).toEqual(['range']);
    expect(below[0].text).toContain('below');
  });

  it('ignores equal prices and non-finite input', () => {
    expect(collectPlanAlerts(282, 282, plan)).toEqual([]);
    expect(collectPlanAlerts(Number.NaN, 282, plan)).toEqual([]);
  });
});