import {
  type EntryPlanStatus,
  type IntradayEntryPlan,
  type IntradayPrediction,
  type IntradayPriceZone,
  type IntradayTargetContext,
} from '@kansoku/shared/types';
import { pyRound } from '../indicators.js';
import { ENTRY_STATUS_NOTES, ZONE_COLORS } from './constants.js';

/** The reward-to-risk floor from TD-RR-01. */
export const MIN_RR = 1.5;

function price(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The first moment a bar may trigger the entry: when the call was made, or the anchor bar's
 * start for older predictions that did not record it. Bars inside a day or hourly anchor
 * that came before the call must not count as a fill.
 */
export function callStartTs(
  anchorTime: string | undefined,
  madeAt: string | undefined,
): number | null {
  const anchorTs = anchorTime ? Math.floor(Date.parse(anchorTime) / 1000) : NaN;
  const madeTs = madeAt ? Math.floor(Date.parse(madeAt) / 1000) : NaN;
  if (!Number.isFinite(anchorTs)) return Number.isFinite(madeTs) ? madeTs : null;
  return Number.isFinite(madeTs) ? Math.max(anchorTs, madeTs) : anchorTs;
}

export function resolveEntryPlanStatus(
  plan: Pick<IntradayEntryPlan, 'entry' | 'stop'>,
  direction: 'long' | 'short' | 'neutral',
  anchorTs: number | null,
  candles: { time: number; high: number; low: number; close: number }[],
): { status: EntryPlanStatus; note: string | null; triggered_at: number | null } | null {
  if (direction === 'neutral' || anchorTs === null) return null;
  const midpoint = (plan.entry + plan.stop) / 2;
  const towardStop = (c: { low: number; high: number; close: number }) =>
    direction === 'long'
      ? c.low <= plan.stop || c.close <= midpoint
      : c.high >= plan.stop || c.close >= midpoint;
  const touchesEntry = (c: { low: number; high: number }) =>
    c.low <= plan.entry && plan.entry <= c.high;
  const hitsStop = (c: { low: number; high: number }) =>
    direction === 'long' ? c.low <= plan.stop : c.high >= plan.stop;

  let triggeredAt: number | null = null;
  for (const c of candles) {
    if (c.time < anchorTs) continue;
    if (triggeredAt === null) {
      if (touchesEntry(c)) triggeredAt = c.time;
      else if (towardStop(c))
        return {
          status: 'invalidated',
          note: ENTRY_STATUS_NOTES.invalidated,
          triggered_at: null,
        };
    } else if (hitsStop(c)) {
      return { status: 'stopped', note: ENTRY_STATUS_NOTES.stopped, triggered_at: triggeredAt };
    }
  }
  if (triggeredAt !== null) {
    return { status: 'triggered', note: ENTRY_STATUS_NOTES.triggered, triggered_at: triggeredAt };
  }
  return { status: 'waiting', note: null, triggered_at: null };
}

export function computeIntradayEntryPlan(
  raw: NonNullable<IntradayPrediction['entry_plan']>,
  direction: string,
  extraZones: IntradayPrediction['price_zones'] = [],
): IntradayEntryPlan {
  const entry = Number(raw.entry);
  const stop = Number(raw.stop);
  const targetFromPct = (pct: number) =>
    pyRound(direction === 'short' ? entry * (1 - pct / 100) : entry * (1 + pct / 100), 4);
  const pctFromTarget = (target: number) => {
    if (!entry) return 0;
    const rawPct =
      direction === 'short' ? ((entry - target) / entry) * 100 : ((target - entry) / entry) * 100;
    return pyRound(rawPct, 4);
  };
  const rawT1Pct = Number(raw.target1_pct ?? 3);
  const rawT2Pct = Number(raw.target2_pct ?? 6);
  // Number(null) is 0, which would read as a real target of $0; only a positive price counts.
  const givenT1 = price(raw.target1);
  const givenT2 = price(raw.target2);
  const target1 = givenT1 ?? targetFromPct(rawT1Pct);
  const target2 = givenT2 ?? targetFromPct(rawT2Pct);
  const t1Pct = givenT1 === undefined ? rawT1Pct : pctFromTarget(target1);
  const t2Pct = givenT2 === undefined ? rawT2Pct : pctFromTarget(target2);
  // Reward-to-risk is measured to the first target (TD-RR-01): T2 is often a filled-in
  // default, and it is the farther, less likely target.
  const risk = direction === 'short' ? stop - entry : entry - stop;
  const reward = direction === 'short' ? entry - target1 : target1 - entry;
  const rr = risk > 0 ? reward / risk : 0;
  const entryZone = normalizePriceZone(raw.entry_zone, 'entry', '入场参考');
  const targetContexts: IntradayTargetContext[] = [
    {
      key: 'target1',
      label: raw.target1_label ?? 'T1',
      price: target1,
      zone: normalizePriceZone(raw.target1_zone, 'target', 'T1 参考结构'),
      note: raw.target1_note,
      condition: raw.target1_condition,
    },
    {
      key: 'target2',
      label: raw.target2_label ?? 'T2',
      price: target2,
      zone: normalizePriceZone(raw.target2_zone, 'target', 'T2 参考结构'),
      note: raw.target2_note,
      condition: raw.target2_condition,
    },
  ];
  const priceZones = (extraZones ?? [])
    .map((z) => normalizePriceZone(z, z.kind ?? 'watch', z.label ?? '压力/阻力区'))
    .filter((z): z is IntradayPriceZone => z?.kind === 'resistance');
  return {
    entry,
    stop,
    target1,
    target1_pct: t1Pct,
    target2,
    target2_pct: t2Pct,
    rr,
    rr_ok: rr >= MIN_RR,
    rr_great: rr >= 3,
    note: raw.note ?? '',
    rationale: raw.rationale ?? '',
    stop_note: raw.stop_note ?? '',
    entry_zone: entryZone,
    target_contexts: targetContexts,
    price_zones: dedupeZones(priceZones),
  };
}

function normalizePriceZone(
  raw: Partial<IntradayPriceZone> | undefined,
  kind: IntradayPriceZone['kind'],
  fallbackLabel: string,
  fallbackPrice?: number,
): IntradayPriceZone | null {
  const low = Number(raw?.low ?? fallbackPrice);
  const high = Number(raw?.high ?? raw?.low ?? fallbackPrice);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return {
    kind: raw?.kind ?? kind,
    label: raw?.label ?? fallbackLabel,
    low: pyRound(lo, 4),
    high: pyRound(hi, 4),
    note: raw?.note,
    source: raw?.source,
    sources: raw?.sources?.filter(Boolean) ?? (raw?.source ? [raw.source] : undefined),
    color: raw?.color ?? ZONE_COLORS[raw?.kind ?? kind] ?? ZONE_COLORS.watch,
  };
}

function dedupeZones(zones: IntradayPriceZone[]): IntradayPriceZone[] {
  const seen = new Set<string>();
  return zones.filter((z) => {
    const key = `${z.kind}:${z.label}:${z.low}:${z.high}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
