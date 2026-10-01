import type {
  PredictionScorecard,
  ScorecardGroup,
  ScorecardRow,
} from '@kansoku/shared/types';
import { REASSESS_TF_ORDER } from '../ai/agents/analysisTimeframes.js';
import { addRow, emptyBucket, finalize, type MutableBucket } from './stats.js';

export const UNKNOWN_KEY = 'unknown';
export const RECENT_LIMIT = 50;

const DIRECTION_ORDER = ['long', 'short', 'neutral'] as const;
const TF_RANK = new Map<string, number>(REASSESS_TF_ORDER.map((tf, i) => [tf, i]));

function tfRank(tf: string): number {
  return TF_RANK.get(tf) ?? REASSESS_TF_ORDER.length;
}

/** Canonical window-set key, e.g. ["h1","m5"] -> "m5,h1". */
export function windowsKey(windows: readonly string[] | null | undefined): string {
  if (!windows?.length) return UNKNOWN_KEY;
  return [...new Set(windows)].sort((a, b) => tfRank(a) - tfRank(b)).join(',');
}

function compareTfKeys(a: string, b: string): number {
  if (a === UNKNOWN_KEY) return 1;
  if (b === UNKNOWN_KEY) return -1;
  return tfRank(a) - tfRank(b);
}

/** Window sets sort by their first timeframe, then by size. */
function compareWindowKeys(a: string, b: string): number {
  if (a === UNKNOWN_KEY) return 1;
  if (b === UNKNOWN_KEY) return -1;
  const left = a.split(',');
  const right = b.split(',');
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const diff = tfRank(left[i]) - tfRank(right[i]);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

function groupBy(
  rows: readonly ScorecardRow[],
  keyOf: (row: ScorecardRow) => string,
  compare: (a: string, b: string) => number,
): ScorecardGroup[] {
  const buckets = new Map<string, MutableBucket>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = buckets.get(key) ?? emptyBucket();
    addRow(bucket, row.outcome, row.direction);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([key, bucket]) => ({ key, bucket: finalize(bucket) }));
}

export function buildScorecard(
  rows: readonly ScorecardRow[],
  since: string | null,
  recentLimit = RECENT_LIMIT,
): PredictionScorecard {
  const overall = emptyBucket();
  for (const row of rows) addRow(overall, row.outcome, row.direction);

  const newestFirst = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    since,
    total: rows.length,
    overall: finalize(overall),
    by_anchor: groupBy(rows, (row) => row.anchor_tf ?? UNKNOWN_KEY, compareTfKeys),
    by_direction: groupBy(
      rows,
      (row) => row.direction,
      (a, b) =>
        DIRECTION_ORDER.indexOf(a as (typeof DIRECTION_ORDER)[number]) -
        DIRECTION_ORDER.indexOf(b as (typeof DIRECTION_ORDER)[number]),
    ),
    by_windows: groupBy(rows, (row) => windowsKey(row.windows), compareWindowKeys),
    recent: newestFirst.slice(0, recentLimit),
  };
}

/** ISO cut-off for a "last N days" filter; null keeps all history. */
export function scorecardSince(days: number | undefined, now: number): string | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null;
  return new Date(now - Math.floor(days) * 86_400_000).toISOString();
}
