import type {
  AnalysisOutcome,
  ChartDoc,
  ChartMeta,
  IntradayPrediction,
  RawBar,
  ScorecardRow,
} from '@kansoku/shared/types';
import { chartUrl } from '../platform/chartUrl.js';
import { listCharts, loadChart } from '../charts/store.js';
import { getProvider } from '../marketdata/registry.js';
import { marketOf } from '../symbols/symbol.utils.js';
import { attachRMultiple, judgeOutcome, zoneFromPrediction } from './outcome.js';
import {
  type CachedOutcome,
  currentVerdict,
  getResolvedOutcomes,
  legacyVerdict,
  saveResolvedOutcome,
} from './outcomeCache.js';

/** Same window the History tab judges on, so both views agree on the same chart. */
const PRIMARY_PERIOD = '15m';
const PRIMARY_BARS = 300;
/** 15m bars only reach back ~3 weeks; slower anchors (4h / day) fall back to hourly bars. */
const FALLBACK_PERIOD = '1h';
const FALLBACK_BARS = 1000;

type OutcomePlan = { entry?: number; stop?: number; target1?: number } | null;

/** Each fetch spawns a longbridge CLI process; "All time" can touch dozens of symbols. */
const MAX_PARALLEL_FETCHES = 4;

export interface ScorecardSourceDeps {
  listCharts: () => Promise<ChartMeta[]>;
  loadChart: (id: string) => Promise<ChartDoc | null>;
  getResolvedOutcomes: (ids: string[]) => Promise<Map<string, CachedOutcome>>;
  saveResolvedOutcome: (
    key: { chartId: string; symbol: string; direction: 'long' | 'short' | 'neutral' },
    outcome: AnalysisOutcome,
  ) => Promise<void>;
  getKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
}

export const defaultScorecardSourceDeps: ScorecardSourceDeps = {
  listCharts: () => listCharts({ type: 'intraday' }),
  loadChart,
  getResolvedOutcomes,
  saveResolvedOutcome,
  getKline: (symbol, period, count) => getProvider(marketOf(symbol)).getKline(symbol, period, count),
};

/** Older docs narrowed analysis_timeframes to the pinned anchor, so one entry is not a set. */
export function predictionWindows(prediction: IntradayPrediction): string[] | null {
  if (prediction.analysis_windows?.length) return [...prediction.analysis_windows];
  const legacy = prediction.analysis_timeframes;
  return legacy && legacy.length > 1 ? [...legacy] : null;
}

function planOf(doc: ChartDoc): OutcomePlan {
  if (doc.built.kind !== 'intraday' || !doc.built.entryPlan) return null;
  const { entry, stop, target1 } = doc.built.entryPlan;
  return { entry, stop, target1 };
}

function validConviction(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100
    ? Math.round(value)
    : null;
}

/** Runs at most `limit` tasks at once, in submission order. */
function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/** Memoizes one bar fetch per symbol and period; a failed fetch is remembered as null. */
function barCache(deps: ScorecardSourceDeps) {
  const cache = new Map<string, Promise<RawBar[] | null>>();
  const limit = createLimiter(MAX_PARALLEL_FETCHES);
  return (symbol: string, period: string, count: number): Promise<RawBar[] | null> => {
    const key = `${symbol}|${period}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = limit(() => deps.getKline(symbol, period, count)).catch(() => null);
      cache.set(key, pending);
    }
    return pending;
  };
}

/** Chart files are several MB each; read a few at a time and keep only what the card needs. */
const MAX_PARALLEL_DOCS = 3;

interface PredictionSummary {
  prediction: IntradayPrediction;
  plan: OutcomePlan;
}

async function summarize(
  deps: ScorecardSourceDeps,
  id: string,
): Promise<PredictionSummary | null> {
  const doc = await deps.loadChart(id).catch(() => null);
  if (!doc || doc.input.origin !== 'analyst') return null;
  const prediction = (doc.input.prediction as IntradayPrediction | null | undefined) ?? null;
  if (!prediction?.direction) return null;
  // Copy out the few fields used below so the parsed document can be freed.
  return {
    prediction: {
      direction: prediction.direction,
      anchor: prediction.anchor,
      range_plan: prediction.range_plan,
      range_bound_plan: prediction.range_bound_plan,
      analysis_windows: prediction.analysis_windows,
      analysis_timeframes: prediction.analysis_timeframes,
      conviction: prediction.conviction,
    },
    plan: planOf(doc),
  };
}

/** Loads every AI prediction since `since`, judging the ones that have no cached verdict. */
export async function loadScorecardRows(
  since: string | null,
  deps: ScorecardSourceDeps = defaultScorecardSourceDeps,
): Promise<ScorecardRow[]> {
  const metas = (await deps.listCharts()).filter(
    (meta) => meta.symbol && (since === null || meta.created_at >= since),
  );
  const cached = await deps.getResolvedOutcomes(metas.map((meta) => meta.id));
  const bars = barCache(deps);
  const limitDocs = createLimiter(MAX_PARALLEL_DOCS);

  const rows = await Promise.all(
    metas.map(async (meta): Promise<ScorecardRow | null> => {
      const summary = await limitDocs(() => summarize(deps, meta.id));
      if (!summary) return null;
      const { prediction, plan } = summary;
      const symbol = meta.symbol!;

      let outcome = attachRMultiple(
        currentVerdict(cached.get(meta.id)),
        prediction.direction,
        plan,
      );
      if (!outcome && prediction.anchor) {
        const anchor = {
          time: prediction.anchor.time,
          price: prediction.anchor.price,
          madeAt: meta.created_at,
        };
        const zone = zoneFromPrediction(prediction);
        const primary = await bars(symbol, PRIMARY_PERIOD, PRIMARY_BARS);
        outcome = primary ? judgeOutcome(prediction.direction, anchor, plan, primary, zone) : null;
        // Settle on hourly bars only when the 15m bars loaded but no longer reach the anchor;
        // a failed fetch is just "not judged this time". Hourly verdicts are coarser, so they
        // are shown but never written to the shared cache the History tab also reads.
        if (!outcome && primary) {
          const fallback = await bars(symbol, FALLBACK_PERIOD, FALLBACK_BARS);
          outcome = fallback
            ? judgeOutcome(prediction.direction, anchor, plan, fallback, zone)
            : null;
        } else if (outcome && outcome.status !== 'open') {
          void deps
            .saveResolvedOutcome(
              { chartId: meta.id, symbol, direction: prediction.direction },
              outcome,
            )
            .catch(() => {});
        }
      }
      outcome ??= attachRMultiple(legacyVerdict(cached.get(meta.id)), prediction.direction, plan);

      return {
        chart_id: meta.id,
        symbol,
        created_at: meta.created_at,
        url: chartUrl(meta),
        direction: prediction.direction,
        anchor_tf: prediction.anchor?.timeframe ?? null,
        windows: predictionWindows(prediction),
        conviction: validConviction(prediction.conviction),
        outcome,
      };
    }),
  );
  return rows.filter((row): row is ScorecardRow => row !== null);
}
