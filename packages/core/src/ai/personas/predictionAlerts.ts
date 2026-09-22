import type { ChartDoc, QuoteCell } from '@kansoku/shared/types';
import { listCharts, loadChart } from '../../charts/store.js';
import { onAnyQuoteUpdate } from '../../realtime/quotes.js';
import { easternDate } from '../../marketdata/session.js';
import { appendComment } from './comments.js';

const PLAN_TTL_MS = 5 * 60_000;
const NEGATIVE_PLAN_TTL_MS = 60_000;

export interface PlanAlertLevel {
  key: string;
  label: string;
  value: number;
}

export interface WatchPlan {
  chartId: string | null;
  createdDate: string;
  direction: string;
  levels: PlanAlertLevel[];
  range: { low: number; high: number } | null;
}

export interface PlanAlertEvent {
  key: string;
  text: string;
}

const fmt = (v: number) => `$${v.toFixed(2)}`;

export function planFromDoc(doc: ChartDoc): WatchPlan | null {
  if (doc.built?.kind !== 'intraday') return null;
  const prediction = doc.built.sidebar.prediction;
  if (!prediction) return null;
  const levels: PlanAlertLevel[] = [];
  const ep = doc.built.entryPlan;
  if (ep?.entry != null && Number.isFinite(Number(ep.entry)))
    levels.push({ key: 'entry', label: 'Entry', value: Number(ep.entry) });
  if (ep?.stop != null && Number.isFinite(Number(ep.stop)))
    levels.push({ key: 'stop', label: 'Stop', value: Number(ep.stop) });
  if (ep?.target1 != null && Number.isFinite(Number(ep.target1)))
    levels.push({ key: 'target1', label: 'Target 1', value: Number(ep.target1) });
  if (ep?.target2 != null && Number.isFinite(Number(ep.target2)))
    levels.push({ key: 'target2', label: 'Target 2', value: Number(ep.target2) });
  const rbp = prediction.range_bound_plan;
  const range =
    rbp && rbp.low != null && rbp.high != null && Number.isFinite(Number(rbp.low))
      ? { low: Number(rbp.low), high: Number(rbp.high) }
      : null;
  if (!levels.length && !range) return null;
  return {
    chartId: doc.id,
    createdDate: easternDate(new Date(doc.created_at)),
    direction: prediction.direction,
    levels,
    range,
  };
}

function crossed(prev: number, price: number, value: number): 'up' | 'down' | null {
  if (prev < value && price >= value) return 'up';
  if (prev > value && price <= value) return 'down';
  return null;
}

export function collectPlanAlerts(
  prev: number,
  price: number,
  plan: WatchPlan,
): PlanAlertEvent[] {
  if (!Number.isFinite(prev) || !Number.isFinite(price) || prev === price) return [];
  const events: PlanAlertEvent[] = [];
  for (const level of plan.levels) {
    const dir = crossed(prev, price, level.value);
    if (!dir) continue;
    const arrow = dir === 'up' ? '⬆️' : '⬇️';
    events.push({
      key: level.key,
      text: `${arrow} ${level.label} ${fmt(level.value)} crossed at ${fmt(price)}`,
    });
  }
  if (plan.range) {
    const { low, high } = plan.range;
    if (prev >= low && price < low) {
      events.push({
        key: 'range',
        text: `💥 Broke below the ${fmt(low)}–${fmt(high)} range at ${fmt(price)}`,
      });
    } else if (prev <= high && price > high) {
      events.push({
        key: 'range',
        text: `🚀 Broke above the ${fmt(low)}–${fmt(high)} range at ${fmt(price)}`,
      });
    }
  }
  return events;
}

const planCache = new Map<string, { plan: WatchPlan | null; at: number }>();
const prevPrice = new Map<string, number>();
// symbol -> { docId, fired: Set<eventKey> }; reset when a new plan arrives
const firedAlerts = new Map<string, { docId: string; keys: Set<string> }>();

export function resetPredictionAlertState(): void {
  planCache.clear();
  prevPrice.clear();
  firedAlerts.clear();
}

async function loadPlan(symbol: string): Promise<WatchPlan | null> {
  const metas = await listCharts({ symbol, type: 'intraday' });
  const latest = metas.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest) return null;
  const doc = await loadChart(latest.id);
  return doc ? planFromDoc(doc) : null;
}

export async function handlePredictionTick(cell: QuoteCell): Promise<void> {
  const price = cell.regularLast ?? cell.last;
  if (!Number.isFinite(price)) return;
  const prev = prevPrice.get(cell.symbol);
  prevPrice.set(cell.symbol, price);
  if (prev == null) return;

  const now = Date.now();
  let entry = planCache.get(cell.symbol);
  if (!entry) {
    entry = { plan: null, at: 0 };
    planCache.set(cell.symbol, entry);
  }
  const ttl = entry.plan === null ? NEGATIVE_PLAN_TTL_MS : PLAN_TTL_MS;
  if (now - entry.at > ttl) {
    entry.plan = await loadPlan(cell.symbol).catch(() => null);
    entry.at = now;
    // A new plan replaces the old one: forget what already fired for it.
    if (entry.plan) firedAlerts.delete(cell.symbol);
  }

  const plan = entry.plan;
  if (!plan) return;
  // Stale predictions from past sessions must not fire on today's ticks.
  if (plan.createdDate !== easternDate(new Date())) return;

  const fired =
    firedAlerts.get(cell.symbol)?.docId === plan.chartId
      ? firedAlerts.get(cell.symbol)!
      : { docId: plan.chartId ?? '', keys: new Set<string>() };
  if (firedAlerts.get(cell.symbol)?.docId !== fired.docId) firedAlerts.set(cell.symbol, fired);

  for (const event of collectPlanAlerts(prev, price, plan)) {
    if (fired.keys.has(event.key)) continue;
    fired.keys.add(event.key);
    await appendComment({
      ts: new Date().toISOString(),
      symbol: cell.symbol,
      level: 'alert',
      text: event.text,
      source: 'system',
      ...(plan.chartId ? { chartId: plan.chartId } : {}),
    });
  }
}

let initialized = false;

export function initPredictionAlerts(): void {
  if (initialized) return;
  initialized = true;
  onAnyQuoteUpdate((cell) => {
    void handlePredictionTick(cell).catch(() => {});
  });
}