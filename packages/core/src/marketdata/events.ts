import type { IntradayEventRisk, MacroEventItem } from '@kansoku/shared/types';
import { getProvider } from './registry.js';
import { easternDate } from './session.js';
import { marketOf, type Market } from '../symbols/symbol.utils.js';

const EARNINGS_TTL_MS = 6 * 60 * 60_000;
const MACRO_TTL_MS = 60 * 60_000;
// A failed lookup is retried after this long. Parking it for the full TTL hid an
// upcoming earnings report or CPI release for hours after one broker hiccup.
const FAILURE_RETRY_MS = 2 * 60_000;
const MACRO_WINDOW_DAYS = 3;
const MAX_MACRO_ITEMS = 8;
const MACRO_MIN_STAR = 3;

interface EarningsEntry {
  at: number;
  val: IntradayEventRisk['next_earnings'];
  // True when the null is "the broker would not answer", not "no report scheduled".
  // The two are the same to the sidebar and must never be the same to a collector.
  failed: boolean;
}

const earningsCache = new Map<string, EarningsEntry>();
const macroCache = new Map<Market, { at: number; val: MacroEventItem[]; failed?: boolean }>();
const relevanceCache = new Map<
  string,
  { at: number; fingerprint: string; val: MacroEventItem[] }
>();

export function resetEventCachesForTests(): void {
  earningsCache.clear();
  macroCache.clear();
  relevanceCache.clear();
}

function fresh(entry: EarningsEntry | undefined): boolean {
  if (entry === undefined) return false;
  return Date.now() - entry.at < (entry.failed ? FAILURE_RETRY_MS : EARNINGS_TTL_MS);
}

// Shares the cache with nextEarnings but not its failure contract: a caller that has
// to tell "no report scheduled" from "the broker would not answer" gets the error,
// and never gets a null the tolerant path parked there after a failure.
export async function nextEarningsStrict(
  symbol: string,
  now: Date,
): Promise<IntradayEventRisk['next_earnings']> {
  const hit = earningsCache.get(symbol);
  if (hit && fresh(hit) && !hit.failed) return hit.val;
  const today = easternDate(now);
  const provider = getProvider(marketOf(symbol));
  const val = (await provider.getEarningsCalendar?.(symbol, today)) ?? null;
  earningsCache.set(symbol, { at: Date.now(), val, failed: false });
  return val;
}

export async function nextEarnings(
  symbol: string,
  now: Date,
): Promise<IntradayEventRisk['next_earnings']> {
  // Reads the failure entries too, so the sidebar does not retry on every render; a
  // failure is retried after FAILURE_RETRY_MS. The last good answer is kept through a
  // failure: a known report date is still right when the broker blips.
  const hit = earningsCache.get(symbol);
  if (hit && fresh(hit)) return hit.val;
  try {
    return await nextEarningsStrict(symbol, now);
  } catch {
    const known = hit?.val ?? null;
    earningsCache.set(symbol, { at: Date.now(), val: known, failed: true });
    return known;
  }
}

async function macroReleases(now: Date, market: Market): Promise<MacroEventItem[]> {
  const hit = macroCache.get(market);
  if (hit && Date.now() - hit.at < (hit.failed ? FAILURE_RETRY_MS : MACRO_TTL_MS)) return hit.val;
  let val: MacroEventItem[] = [];
  let failed = false;
  try {
    const start = easternDate(now);
    const end = easternDate(new Date(now.getTime() + MACRO_WINDOW_DAYS * 86_400_000));
    const provider = getProvider(market);
    const result = await provider.getMacroCalendar?.(market, start, end, MACRO_MIN_STAR);
    if (result?.supported) {
      val = [...result.items].sort((a, b) => (a.ts < b.ts ? -1 : 1)).slice(0, MAX_MACRO_ITEMS);
    }
  } catch {
    // Keep the last good list; retry soon.
    val = hit?.val ?? [];
    failed = true;
  }
  macroCache.set(market, { at: Date.now(), val, failed });
  return val;
}

async function relevantMacro(
  symbol: string,
  macro: MacroEventItem[],
  now: Date,
): Promise<MacroEventItem[]> {
  const upcoming = macro.filter((m) => Date.parse(m.ts) > now.getTime());
  if (!upcoming.length) return upcoming;
  try {
    const [{ activeSettingsRevision }, { filterMacroForSymbol }] = await Promise.all([
      import('../ai/settings/settingsStore.js'),
      import('../ai/personas/eventFilter.js'),
    ]);
    const fingerprint = `${activeSettingsRevision()}|${upcoming.map((m) => `${m.ts}|${m.title}`).join('\n')}`;
    const hit = relevanceCache.get(symbol);
    if (hit && hit.fingerprint === fingerprint && Date.now() - hit.at < MACRO_TTL_MS) return hit.val;
    const val = await filterMacroForSymbol(symbol, upcoming).catch(() => upcoming);
    relevanceCache.set(symbol, { at: Date.now(), fingerprint, val });
    return val;
  } catch {
    return upcoming;
  }
}

export async function getEventRisk(
  symbol: string,
  now = new Date(),
): Promise<IntradayEventRisk | null> {
  const market = marketOf(symbol);
  if (market !== 'US') return null;
  const [earnings, macro] = await Promise.all([
    nextEarnings(symbol, now),
    macroReleases(now, market),
  ]);
  const relevant = await relevantMacro(symbol, macro, now);
  if (!earnings && !relevant.length) return null;
  return { next_earnings: earnings, macro: relevant, updated_at: now.toISOString() };
}
