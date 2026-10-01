import { describe, expect, it } from 'vitest';
import type { AnalysisOutcome } from '@kansoku/shared/types';
import { createDb } from '../src/db/index.js';
import {
  callMadeAt,
  currentVerdict,
  deleteResolvedOutcome,
  getResolvedOutcomes,
  legacyVerdict,
  OUTCOME_RULES,
  saveResolvedOutcome,
} from '../src/cockpit/outcomeCache.js';
import { outcomes } from '../src/db/schema.js';

function outcome(status: AnalysisOutcome['status'], pct = 1): AnalysisOutcome {
  return { status, pct_since_anchor: pct, resolved_at: status === 'open' ? null : 1751400000 };
}

describe('outcome cache', () => {
  it('stores resolved outcomes and reads them back', async () => {
    const db = createDb(':memory:');
    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('hit_target', 4.2),
      db,
    );
    await saveResolvedOutcome(
      { chartId: 'c2', symbol: 'MU.US', direction: 'short' },
      outcome('hit_stop', -2),
      db,
    );
    const map = await getResolvedOutcomes(['c1', 'c2', 'c3'], db);
    expect(map.size).toBe(2);
    expect(map.get('c1')).toEqual({
      status: 'hit_target',
      pct_since_anchor: 4.2,
      resolved_at: 1751400000,
    });
    expect(map.get('c3')).toBeUndefined();
  });

  it('refuses to store open outcomes', async () => {
    const db = createDb(':memory:');
    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('open'),
      db,
    );
    expect((await getResolvedOutcomes(['c1'], db)).size).toBe(0);
  });

  it('keeps the first resolution on duplicate saves', async () => {
    const db = createDb(':memory:');
    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('hit_target', 4),
      db,
    );
    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('hit_stop', -9),
      db,
    );
    expect((await getResolvedOutcomes(['c1'], db)).get('c1')?.status).toBe('hit_target');
  });

  it('marks old-rules verdicts as legacy and lets a re-judge replace them', async () => {
    const db = createDb(':memory:');
    await db.insert(outcomes).values({
      chartId: 'c1',
      symbol: 'MU.US',
      direction: 'long',
      status: 'hit_target',
      pctSinceAnchor: 4,
      resolvedAt: 1751400000,
      judgedAt: '2026-09-01T00:00:00.000Z',
      rules: 1,
    });
    const before = (await getResolvedOutcomes(['c1'], db)).get('c1');
    expect(currentVerdict(before)).toBeNull();
    expect(legacyVerdict(before)).toEqual({
      status: 'hit_target',
      pct_since_anchor: 4,
      resolved_at: 1751400000,
    });

    await saveResolvedOutcome(
      { chartId: 'c1', symbol: 'MU.US', direction: 'long' },
      outcome('hit_stop', -2),
      db,
    );
    const after = (await getResolvedOutcomes(['c1'], db)).get('c1');
    expect(currentVerdict(after)?.status).toBe('hit_stop');
    expect(OUTCOME_RULES).toBeGreaterThan(1);
  });

  it('returns an empty map for no ids', async () => {
    const db = createDb(':memory:');
    expect((await getResolvedOutcomes([], db)).size).toBe(0);
  });
  it('forgets a verdict when the prediction is edited', async () => {
    const db = createDb(':memory:');
    const key = { chartId: 'c1', symbol: 'MU.US', direction: 'long' as const };
    await saveResolvedOutcome(key, outcome('hit_target'), db);
    await deleteResolvedOutcome('c1', db);
    expect((await getResolvedOutcomes(['c1'], db)).size).toBe(0);
  });

  it('counts an edited call from the edit, never from before the chart existed', () => {
    const created = '2026-09-01T14:00:00.000Z';
    expect(callMadeAt(created, '2026-09-02T15:00:00.000Z')).toBe('2026-09-02T15:00:00.000Z');
    expect(callMadeAt(created, '2026-08-01T00:00:00.000Z')).toBe(created);
    expect(callMadeAt(created, undefined)).toBe(created);
  });
});
