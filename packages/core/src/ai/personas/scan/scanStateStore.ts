import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ScanSetup, WatchlistScanState } from '@kansoku/shared/types';
import { getDb } from '../../../db/index.js';
import { appMeta } from '../../../db/schema.js';

const KEY = 'watchlist_scan_v1';

/** Shown on items that were still waiting or running when the app closed. */
export const INTERRUPTED_REASON = 'app closed before it finished';

export interface ScanStateStore {
  load(): WatchlistScanState | null;
  save(state: WatchlistScanState): void;
}

const isSetup = (value: unknown): value is ScanSetup => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.symbol === 'string' &&
    typeof row.chart_id === 'string' &&
    typeof row.score === 'number' &&
    (row.direction === 'long' || row.direction === 'short' || row.direction === 'neutral')
  );
};

const savedScanSchema = z.object({
  scope: z.enum(['watchlist', 'positions']),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  timeframes: z.array(z.string()),
  anchor_tf: z.string().nullable(),
  items: z.array(
    z.object({
      symbol: z.string(),
      status: z.enum(['queued', 'running', 'done', 'failed', 'skipped', 'cancelled']),
      chart_id: z.string().nullable(),
      reason: z.string().nullable(),
      started_at: z.string().nullable(),
      finished_at: z.string().nullable(),
    }),
  ),
  setups: z.array(z.custom<ScanSetup>(isSetup)),
  ranges: z.array(z.custom<ScanSetup>(isSetup)),
  skipped_over_cap: z.number(),
});

/**
 * A saved scan as it should look after a restart: nothing is running any more, so items
 * that were waiting or mid-run are marked stopped and can be re-run.
 */
export function restoreScanState(raw: unknown): WatchlistScanState | null {
  const parsed = savedScanSchema.safeParse(raw);
  if (!parsed.success) return null;
  const saved = parsed.data;
  return {
    ...saved,
    running: false,
    items: saved.items.map((item) =>
      item.status === 'queued' || item.status === 'running'
        ? { ...item, status: 'cancelled', reason: INTERRUPTED_REASON }
        : item,
    ),
  };
}

/** Keeps the last scan across restarts, so its results and failures are still there. */
export const appMetaScanStateStore: ScanStateStore = {
  load() {
    try {
      const row = getDb().select().from(appMeta).where(eq(appMeta.key, KEY)).get();
      return row ? restoreScanState(JSON.parse(row.value)) : null;
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      const value = JSON.stringify(state);
      getDb()
        .insert(appMeta)
        .values({ key: KEY, value })
        .onConflictDoUpdate({ target: appMeta.key, set: { value } })
        .run();
    } catch (error) {
      console.warn('[scan] could not save the scan state', error);
    }
  },
};
