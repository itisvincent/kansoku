import { eq } from 'drizzle-orm';
import type { DeepDiveState } from '@kansoku/pro-api';
import { getDb } from '../../../db/index.js';
import { appMeta } from '../../../db/schema.js';

type LastResult = NonNullable<DeepDiveState['lastResult']>;

const KEY = 'deep_dive_last_result';

export interface LastResultStore {
  load(): LastResult | null;
  save(result: LastResult): void;
}

function isLastResult(value: unknown): value is LastResult {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.symbol === 'string' && typeof row.ok === 'boolean' && typeof row.finishedAt === 'string'
  );
}

/** Keeps the last deep-dive result across restarts, so a failure is still explained later. */
export const appMetaLastResultStore: LastResultStore = {
  load() {
    try {
      const row = getDb().select().from(appMeta).where(eq(appMeta.key, KEY)).get();
      if (!row) return null;
      const parsed: unknown = JSON.parse(row.value);
      return isLastResult(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  save(result) {
    try {
      const value = JSON.stringify(result);
      getDb()
        .insert(appMeta)
        .values({ key: KEY, value })
        .onConflictDoUpdate({ target: appMeta.key, set: { value } })
        .run();
    } catch (error) {
      console.warn('[deep-dive] could not save the last result', error);
    }
  },
};
