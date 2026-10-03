import type {
  ChartDoc,
  ChartMeta,
  EpsPePlan,
  IntradayPrediction,
  PlanBoard,
  PlanBoardRow,
  PortfolioPositionRow,
} from '@kansoku/shared/types';
import { planFreshness } from '@kansoku/shared/planLevels';
import { listCharts, loadChart } from '../charts/store.js';
import { easternDate } from '../marketdata/session.js';

/** The EPS × PE plan from one saved analysis. */
export interface SavedPlan {
  chart_id: string;
  made_at: string;
  plan: EpsPePlan;
  next_earnings: string | null;
}

/** Enough recent charts to get past re-runs that ended without a plan. */
const CHARTS_TO_SEARCH = 12;

interface FinderDeps {
  listCharts: (symbol: string) => Promise<ChartMeta[]>;
  loadChart: (id: string) => Promise<ChartDoc | null>;
}

function readPlan(meta: ChartMeta, doc: ChartDoc | null): SavedPlan | null {
  const input = doc?.input as
    | { prediction?: IntradayPrediction; event_risk?: { next_earnings?: { date?: string } | null } }
    | undefined;
  const plan = input?.prediction?.eps_pe_plan;
  if (!plan || (!plan.scenarios?.length && !plan.bands?.length)) return null;
  return {
    chart_id: meta.id,
    made_at: input?.prediction?.made_at ?? meta.created_at,
    plan,
    next_earnings: input?.event_risk?.next_earnings?.date ?? null,
  };
}

// A chart is saved again in place: the prediction is PATCHed in after creation, and a
// same-day re-run can reuse the id. Its version is the id plus its save times.
function versionKey(meta: ChartMeta): string {
  return `${meta.id}|${meta.updated_at}|${meta.prediction_updated_at ?? ''}`;
}

/**
 * Finds a symbol's newest saved plan. Each chart version is parsed once: analyses are
 * large files and the board asks for every holding on each refresh.
 */
export function createSavedPlanFinder(deps: FinderDeps) {
  const byVersion = new Map<string, SavedPlan | null>();
  const keysBySymbol = new Map<string, readonly string[]>();
  return async function findSavedPlan(symbol: string): Promise<SavedPlan | null> {
    const metas = await deps.listCharts(symbol);
    const listed = metas.map(versionKey);
    // Versions this symbol no longer lists (re-saved, deleted, past the search window).
    for (const key of keysBySymbol.get(symbol) ?? []) {
      if (!listed.includes(key)) byVersion.delete(key);
    }
    keysBySymbol.set(symbol, listed);
    for (const meta of metas) {
      const key = versionKey(meta);
      if (!byVersion.has(key)) {
        const doc = await deps.loadChart(meta.id);
        // Unreadable right now (mid-write, say): skip it and read it again next time.
        if (!doc) continue;
        byVersion.set(key, readPlan(meta, doc));
      }
      const found = byVersion.get(key);
      if (found) return found;
    }
    return null;
  };
}

export const findSavedPlan = createSavedPlanFinder({
  listCharts: (symbol) => listCharts({ symbol, type: 'intraday', limit: CHARTS_TO_SEARCH }),
  loadChart,
});

export interface PlanBoardDeps {
  listPositions: () => Promise<PortfolioPositionRow[]>;
  findPlan: (symbol: string) => Promise<SavedPlan | null>;
  now: () => number;
}

function targetOf(plan: EpsPePlan, kind: 'bear' | 'base' | 'bull'): number | null {
  return plan.scenarios?.find((row) => row.kind === kind)?.target ?? null;
}

function toRow(position: PortfolioPositionRow, saved: SavedPlan | null, now: number): PlanBoardRow {
  const price = Number.isFinite(position.last) && position.last > 0 ? position.last : null;
  const base = {
    symbol: position.symbol,
    name: position.name,
    quantity: position.quantity,
    market_value: position.market_value,
    price,
  };
  if (!saved) return { ...base, plan: null };
  return {
    ...base,
    plan: {
      chart_id: saved.chart_id,
      made_at: saved.made_at,
      anchor_year: saved.plan.anchor_year ?? null,
      targets: {
        bear: targetOf(saved.plan, 'bear'),
        base: targetOf(saved.plan, 'base'),
        bull: targetOf(saved.plan, 'bull'),
      },
      bands: saved.plan.bands ?? [],
      next_earnings: saved.next_earnings,
      freshness: planFreshness(
        saved.made_at,
        saved.next_earnings,
        easternDate(new Date(now)),
        now,
      ),
    },
  };
}

/** Every holding with its newest EPS × PE plan; a holding without one stays on the board. */
export async function buildPlanBoard(deps: PlanBoardDeps): Promise<PlanBoard> {
  const now = deps.now();
  const positions = await deps.listPositions();
  const rows = await Promise.all(
    positions.map(async (position) => {
      // A read failure keeps the holding on the board as "no plan", but must not be silent:
      // a broken chart store would otherwise look like every analysis vanished.
      const saved = await deps.findPlan(position.symbol).catch((error: unknown) => {
        console.warn(`[plans] could not read the plan for ${position.symbol}`, error);
        return null;
      });
      return toRow(position, saved, now);
    }),
  );
  return { generated_at: new Date(now).toISOString(), rows };
}
