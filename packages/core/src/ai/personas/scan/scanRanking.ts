import type { ChartDoc, IntradayPrediction, ScanSetup } from '@kansoku/shared/types';
import { zoneFromPrediction } from '../../../cockpit/outcome.js';

/** A setup without a stated conviction ranks as a coin flip, not as a sure thing. */
export const DEFAULT_CONVICTION = 50;
/** Past 4:1 the target is usually far-fetched, so extra distance earns no extra rank. */
export const MAX_RANKED_RR = 4;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function rewardRisk(entry: number | null, stop: number | null, target: number | null): number | null {
  if (entry == null || stop == null || target == null) return null;
  const risk = Math.abs(entry - stop);
  if (risk === 0) return null;
  return round2(Math.abs(target - entry) / risk);
}

export function scoreSetup(conviction: number | null, rr: number | null): number {
  if (rr == null) return 0;
  const sure = (conviction ?? DEFAULT_CONVICTION) / 100;
  return round2(sure * Math.min(rr, MAX_RANKED_RR));
}

/** Reads the ranking inputs out of a finished analysis chart. Null when it has no prediction. */
export function setupFromDoc(symbol: string, chartId: string, doc: ChartDoc): ScanSetup | null {
  const prediction = (doc.input.prediction as IntradayPrediction | null | undefined) ?? null;
  if (!prediction?.direction) return null;
  const plan = doc.built.kind === 'intraday' ? doc.built.entryPlan : null;
  const entry = finite(plan?.entry);
  const stop = finite(plan?.stop);
  const target1 = finite(plan?.target1);
  const conviction = finite(prediction.conviction);
  const zone = zoneFromPrediction(prediction);
  const rr = prediction.direction === 'neutral' ? null : rewardRisk(entry, stop, target1);
  return {
    symbol,
    chart_id: chartId,
    direction: prediction.direction,
    conviction: conviction == null ? null : Math.round(conviction),
    entry,
    stop,
    target1,
    reward_risk: rr,
    range_low: zone?.low ?? null,
    range_high: zone?.high ?? null,
    score: prediction.direction === 'neutral' ? 0 : scoreSetup(conviction, rr),
  };
}

/** Splits directional calls (ranked by score) from range calls (ranked by conviction). */
export function rankSetups(setups: readonly ScanSetup[]): { setups: ScanSetup[]; ranges: ScanSetup[] } {
  const directional = setups
    .filter((setup) => setup.direction !== 'neutral')
    .sort((a, b) => b.score - a.score || (b.conviction ?? 0) - (a.conviction ?? 0));
  const ranges = setups
    .filter((setup) => setup.direction === 'neutral')
    .sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));
  return { setups: directional, ranges };
}
