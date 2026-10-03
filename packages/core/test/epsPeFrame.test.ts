import { describe, expect, it } from 'vitest';
import {
  applySavedEpsPeFrame,
  describeSavedEpsPeFrame,
} from '../src/ai/personas/epsPeFrame.js';
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
    // Wording comes from this run (it is told the held multiples); only numbers are held.
    expect(locked.plan.scenarios[0]?.rationale).toBe('new story');
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

  it('replaces old-language wording with the wording from this run', () => {
    const saved = plan({
      eps_growth_note: '共识上修',
      scenarios: [
        { kind: 'bear', eps: 19.53, pe: 16, target: 312.48, rationale: '纯地板价' },
        { kind: 'base', eps: 19.77, pe: 26, target: 514.02, rationale: '回归均值' },
        { kind: 'bull', eps: 20.02, pe: 30, target: 600.6, rationale: '全历史 beat rate' },
      ],
      black_swan: { eps: 18, pe: 10, target: 180, triggers: '资本开支下修' },
      bands: [{ label: '加仓', price: 312.48, note: '接近悲观' }],
      sources: ['旧来源'],
    });
    const incoming = plan({
      eps_growth_note: 'Consensus revised up',
      scenarios: [
        { kind: 'bear', eps: 19.5, pe: 17, target: 331, rationale: 'Floor at 16x' },
        { kind: 'base', eps: 19.7, pe: 22, target: 433, rationale: 'Mean reversion to 26x' },
        { kind: 'bull', eps: 20, pe: 26, target: 520, rationale: 'Full beat rate at 30x' },
      ],
      black_swan: { eps: 18, pe: 10, target: 180, triggers: 'Capex cut' },
      bands: [{ label: 'Add', price: 330, note: 'Near bear' }],
      sources: ['Zacks 2026-09-28'],
    });
    const locked = applySavedEpsPeFrame(saved, incoming);
    expect(locked.plan.scenarios.map((row) => row.pe)).toEqual([16, 26, 30]);
    expect(locked.plan.scenarios.map((row) => row.rationale)).toEqual([
      'Floor at 16x',
      'Mean reversion to 26x',
      'Full beat rate at 30x',
    ]);
    expect(locked.plan.eps_growth_note).toBe('Consensus revised up');
    expect(locked.plan.black_swan?.triggers).toBe('Capex cut');
    expect(locked.plan.black_swan?.target).toBe(180);
    // A band keeps its saved label and price; its note is refreshed only from a band with the
    // same label, so a renamed band keeps its old wording rather than risk a wrong label.
    expect(locked.plan.bands?.[0]).toMatchObject({ label: '加仓', note: '接近悲观', price: 312.48 });
    expect(locked.plan.sources).toEqual([locked.note, 'Zacks 2026-09-28']);
  });

  it('keeps saved band wording when this run produced a different set of bands', () => {
    const saved = plan({ bands: [{ label: 'Add', price: 312.48, note: 'near bear' }] });
    const incoming = plan({ bands: [] });
    expect(applySavedEpsPeFrame(saved, incoming).plan.bands?.[0]?.note).toBe('near bear');
  });
});

describe('band wording', () => {
  it('matches bands by label, not by position', () => {
    const saved = plan({
      bands: [
        { label: 'Starter buy', price: 312, note: 'old starter' },
        { label: 'Thesis stop', price: 250, note: 'old stop' },
      ],
    });
    const incoming = plan({
      bands: [
        { label: 'Thesis stop', price: 255, note: 'new stop' },
        { label: 'Starter buy', price: 315, note: 'new starter' },
      ],
    });
    const bands = applySavedEpsPeFrame(saved, incoming).plan.bands;
    expect(bands).toEqual([
      { label: 'Starter buy', price: 312, note: 'new starter' },
      { label: 'Thesis stop', price: 250, note: 'new stop' },
    ]);
  });
});

describe('describeSavedEpsPeFrame', () => {
  it('names the held ladder for the analyst', () => {
    const line = describeSavedEpsPeFrame(plan());
    expect(line).toContain('FY2027');
    expect(line).toContain('bear 16×, base 26×, bull 30×');
  });

  it('says nothing when no complete frame is saved', () => {
    expect(describeSavedEpsPeFrame(null)).toBeNull();
    expect(describeSavedEpsPeFrame(plan({ scenarios: [] }))).toBeNull();
  });
});

describe('band side', () => {
  it('fills in a side the saved band lacked from the same band in this run', () => {
    const saved = plan();
    const incoming = plan({ bands: [{ label: 'Add', price: 300, side: 'buy' }] });
    const locked = applySavedEpsPeFrame(saved, incoming);
    expect(locked.plan.bands?.[0]).toMatchObject({ label: 'Add', side: 'buy' });
  });
});
