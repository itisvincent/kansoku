import { inArray, lt } from 'drizzle-orm';
import type { AnalysisOutcome, OutcomeStatus } from '@kansoku/shared/types';
import { getDb, type Db } from '../db/index.js';
import { outcomes } from '../db/schema.js';

/**
 * Version of the judging rules in cockpit/outcome.ts. Bump it when a change would give a
 * different verdict for the same bars; older saved verdicts are then judged again, and kept
 * only as a fallback when the bars no longer reach back far enough to re-judge.
 *  1 — counted bars from the start of the anchor bar (could see moves from before the call).
 *  2 — counts bars from when the analysis was made; a target needs the entry filled first.
 */
export const OUTCOME_RULES = 2;

export interface OutcomeKey {
  chartId: string;
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
}

/** A saved verdict. `legacy` marks one made by older judging rules. */
export type CachedOutcome = AnalysisOutcome & { legacy?: true };

export async function getResolvedOutcomes(
  chartIds: string[],
  db: Db = getDb(),
): Promise<Map<string, CachedOutcome>> {
  if (!chartIds.length) return new Map();
  const rows = await db.select().from(outcomes).where(inArray(outcomes.chartId, chartIds));
  return new Map(
    rows.map((row) => {
      const outcome: CachedOutcome = {
        status: row.status as OutcomeStatus,
        pct_since_anchor: row.pctSinceAnchor,
        resolved_at: row.resolvedAt,
      };
      return [row.chartId, row.rules < OUTCOME_RULES ? { ...outcome, legacy: true } : outcome];
    }),
  );
}

/** The saved verdict if it was made by the current rules; otherwise null (judge again). */
export function currentVerdict(cached: CachedOutcome | undefined): AnalysisOutcome | null {
  return cached && !cached.legacy ? cached : null;
}

/** An old-rules verdict, used only when the bars can no longer settle the call again. */
export function legacyVerdict(cached: CachedOutcome | undefined): AnalysisOutcome | null {
  if (!cached?.legacy) return null;
  const { legacy: _legacy, ...outcome } = cached;
  return outcome;
}

export async function saveResolvedOutcome(
  key: OutcomeKey,
  outcome: AnalysisOutcome,
  db: Db = getDb(),
): Promise<void> {
  if (outcome.status === 'open' || outcome.resolved_at == null) return;
  const values = {
    status: outcome.status,
    pctSinceAnchor: outcome.pct_since_anchor,
    resolvedAt: outcome.resolved_at,
    judgedAt: new Date().toISOString(),
    rules: OUTCOME_RULES,
  };
  await db
    .insert(outcomes)
    .values({ chartId: key.chartId, symbol: key.symbol, direction: key.direction, ...values })
    // A verdict under the current rules is final; only an old-rules one is replaced.
    .onConflictDoUpdate({
      target: outcomes.chartId,
      set: values,
      setWhere: lt(outcomes.rules, OUTCOME_RULES),
    });
}
