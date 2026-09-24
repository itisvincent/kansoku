import { describe, expect, it } from 'vitest';
import { applySavedEpsPeFrame } from '../src/ai/personas/epsPeFrame.js';
import type { EpsPePlan } from '@kansoku/shared/types';

function plan(overrides: Partial<EpsPePlan> = {}): EpsPePlan {
  return {
    anchor_year: 'FY2027',
    scenarios: [
      { kind: 'bear', eps: 19.53, pe: 16, target: 312.48, peg: 0.57 },
      { kind: 'base', eps: 19.77, pe: 26, target: 514.02, peg: 0.93 },
      { kind: 'bull', eps: 20.02, pe: 30, target: 600.6, peg: 1.07 },
    ],
    blended_target: 485,
    bands: [{ label: 'Add', price: 312.48, note: 'near bear' }],
    ...overrides,
  };
}

describe('applySavedEpsPeFrame', () => {
  it('keeps the first run when nothing is saved yet', () => {
    const incoming = plan({
      scenarios: [
        { kind: 'bear', eps: 19.39, pe: 17, target: 329.63 },
        { kind: 'base', eps: 19.69, pe: 22, target: 433.18 },
        { kind: 'bull', eps: 19.99, pe: 26, target: 519.74 },
      ],
    });
    const locked = applySavedEpsPeFrame(null, incoming);
    expect(locked.held).toBe(false);
    expect(locked.plan.scenarios.map((row) => row.target)).toEqual([329.63, 433.18, 519.74]);
  });

  it('does not let a re-run replace 26× with 22× when earnings barely moved', () => {
    const incoming = plan({
      scenarios: [
        { kind: 'bear', eps: 19.39, pe: 17, target: 329.63, rationale: 'new story' },
        { kind: 'base', eps: 19.69, pe: 22, target: 433.18 },
        { kind: 'bull', eps: 19.99, pe: 26, target: 519.74 },
      ],
    });
    const locked = applySavedEpsPeFrame(plan(), incoming);
    expect(locked.held).toBe(true);
    expect(locked.earningsMovePct).toBe(0);
    expect(locked.plan.scenarios.map((row) => row.pe)).toEqual([16, 26, 30]);
    expect(locked.plan.scenarios.map((row) => row.target)).toEqual([312.48, 514.02, 600.6]);
    expect(locked.plan.scenarios[0]?.rationale).not.toBe('new story');
    expect(locked.note).toContain('26×');
  });

  it('scales every target by a real consensus earnings move and still holds the multiples', () => {
    const incoming = plan({
      scenarios: [
        { kind: 'bear', eps: 20.31, pe: 18, target: 365 },
        { kind: 'base', eps: 20.5, pe: 24, target: 492 },
        { kind: 'bull', eps: 20.8, pe: 28, target: 582 },
      ],
    });
    const locked = applySavedEpsPeFrame(plan(), incoming);
    expect(locked.held).toBe(true);
    expect(locked.earningsMovePct).toBeCloseTo(4, 0);
    expect(locked.plan.scenarios.map((row) => row.pe)).toEqual([16, 26, 30]);
    expect(locked.plan.scenarios.map((row) => row.target)).toEqual([324.96, 534.56, 624.6]);
    expect(locked.plan.bands?.[0]?.price).toBeCloseTo(324.96, 1);
    expect(locked.plan.blended_target).toBeCloseTo(504.4, 1);
  });
});
