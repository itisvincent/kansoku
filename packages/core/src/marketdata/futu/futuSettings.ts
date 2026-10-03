import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, type Db } from '../../db/index.js';
import { appMeta } from '../../db/schema.js';
import { ClientError } from '../../platform/errors.js';

/** Which broker's candles are tried first; the other is the fallback. */
export type CandleSource = 'longbridge' | 'futu';

/** Whether Kansoku reads the user's Futu account through OpenD, and where OpenD listens. */
export interface FutuSettings {
  enabled: boolean;
  /**
   * Also add the Futu watchlist. Off by default: a Futu "All" group easily holds hundreds
   * of symbols, and each one adds live quotes and a money-flow lookup on Longbridge.
   */
  watchlist: boolean;
  /**
   * The first source for candles (price history). When it fails or returns nothing, the
   * other one is tried. Futu is only used while the account link is on.
   */
  candles: CandleSource;
  host: string;
  port: number;
}

export const DEFAULT_FUTU_SETTINGS: FutuSettings = {
  enabled: false,
  watchlist: false,
  candles: 'longbridge',
  host: '127.0.0.1',
  port: 11111,
};

const KEY = 'futu_opend_v1';

// OpenD only ever runs on this machine for Kansoku; a remote host would send account
// data over the network unencrypted.
const LOCAL_HOST = /^(?:127\.0\.0\.1|localhost|::1)$/i;

const futuSettingsSchema = z.object({
  enabled: z.boolean(),
  watchlist: z.boolean().default(false),
  candles: z.enum(['longbridge', 'futu']).default('longbridge'),
  host: z.string().trim().regex(LOCAL_HOST, 'OpenD must run on this computer (127.0.0.1)'),
  port: z.number().int().min(1).max(65535),
});

export function parseFutuSettings(input: unknown): FutuSettings {
  const result = futuSettingsSchema.safeParse(input);
  if (!result.success) {
    throw new ClientError(
      `invalid Futu settings: ${result.error.issues.map((i) => i.message).join('; ')}`,
      'expected { enabled: boolean, host: "127.0.0.1", port: 11111 }',
    );
  }
  return result.data;
}

// Read on every positions/watchlist call, so it is kept in memory after the first read.
let cached: FutuSettings | null = null;

export function resetFutuSettingsCacheForTests(): void {
  cached = null;
}

export function readFutuSettings(db?: Db): FutuSettings {
  if (cached && !db) return cached;
  let value = DEFAULT_FUTU_SETTINGS;
  try {
    const raw = (db ?? getDb()).select().from(appMeta).where(eq(appMeta.key, KEY)).get()?.value;
    if (raw) value = { ...DEFAULT_FUTU_SETTINGS, ...parseFutuSettings(JSON.parse(raw)) };
  } catch {
    value = DEFAULT_FUTU_SETTINGS;
  }
  if (!db) cached = value;
  return value;
}

export function writeFutuSettings(input: unknown, db: Db = getDb()): FutuSettings {
  const next = parseFutuSettings(input);
  db.insert(appMeta)
    .values({ key: KEY, value: JSON.stringify(next) })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: JSON.stringify(next) } })
    .run();
  cached = next;
  return next;
}
