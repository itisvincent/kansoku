import type { Notice } from '@kansoku/shared/types';
import { bandSide, crossedBands, type PlanBand } from '@kansoku/shared/planLevels';
import { emitNotice, onAnyNotice } from '../ai/personas/notices.js';
import { getProvider } from '../marketdata/registry.js';
import { easternDate } from '../marketdata/session.js';
import { watchQuoteCells } from '../realtime/quotes.js';
import { getInterfaceLocale } from '../settings/interfaceLocale.js';
import { findSavedPlan } from './planBoard.js';

/** Plans change when an analysis finishes; this catches holdings that changed meanwhile. */
const RELOAD_MS = 10 * 60_000;
/** Until the first load works (brokers still connecting at launch), retry this often. */
const START_RETRY_MS = 60_000;

export interface PlanAlertDeps {
  /** Price levels per holding, from its newest saved plan. */
  loadPlans: () => Promise<Map<string, { bands: PlanBand[] }>>;
  /** Calls `onPrice` with live prices for `symbols`; returns a function that stops it. */
  watchPrices: (
    symbols: string[],
    onPrice: (symbol: string, price: number, session: string) => void,
  ) => () => void;
  emit: (notice: Notice) => void;
  /** US Eastern trading date, so "once a day" follows the market's day. */
  today: () => string;
  now: () => number;
  english: () => boolean;
}

const SESSION_EN: Record<string, string> = {
  盘前: 'pre-market',
  盘后: 'after-hours',
  隔夜: 'overnight',
  休市: 'market closed',
};

function shortSymbol(symbol: string): string {
  return symbol.replace(/\.US$/, '');
}

function money(symbol: string, value: number): string {
  const prefix = symbol.endsWith('.HK') ? 'HK$' : /\.(SH|SZ)$/.test(symbol) ? '¥' : '$';
  return `${prefix}${value.toFixed(2)}`;
}

/**
 * One notice for everything a single move crossed. A gap can cross an add level and the
 * thesis stop at once; the stop leads, since it changes what the add level means.
 */
function describe(
  symbol: string,
  crossed: readonly PlanBand[],
  price: number,
  session: string,
  english: boolean,
): { title: string; body: string } {
  const stop = crossed.find((band) => bandSide(band.label, band.side) === 'stop');
  const lead = stop ?? crossed[crossed.length - 1];
  const side = bandSide(lead.label, lead.side);
  const name = shortSymbol(symbol);
  const level = (band: PlanBand) => `${band.label} ${money(symbol, band.price)}`;
  const others = crossed.filter((band) => band !== lead).map(level);
  const notes = crossed.map((band) => band.note).filter(Boolean);
  const extended = session && session !== '日盘';
  if (english) {
    const where = extended ? ` (${SESSION_EN[session] ?? session})` : '';
    const advice =
      side === 'stop'
        ? 'Recheck the plan before adding; the thesis may be broken.'
        : side === 'sell'
          ? 'This is a trim level in your plan.'
          : 'This is an add level in your plan. Check the plan’s conditions first.';
    return {
      title: side === 'stop' ? `${name} fell below ${level(lead)}` : `${name} reached ${level(lead)}`,
      body: [
        `Price ${money(symbol, price)}${where}.`,
        others.length ? `Also passed ${others.join(', ')}.` : '',
        advice,
        ...notes,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  const where = extended ? `（${session}）` : '';
  const advice =
    side === 'stop'
      ? '加仓前先复核计划，投资逻辑可能已经破坏。'
      : side === 'sell'
        ? '这是计划里的减仓位。'
        : '这是计划里的加仓位，先确认计划写的条件。';
  return {
    title: side === 'stop' ? `${name} 跌破 ${level(lead)}` : `${name} 到了 ${level(lead)}`,
    body: [
      `现价 ${money(symbol, price)}${where}。`,
      others.length ? `同时经过 ${others.join('、')}。` : '',
      advice,
      ...notes,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * Sends a notice when a holding's live price crosses a level from its EPS × PE plan.
 * The first price seen after (re)starting only sets a baseline: a level the price was
 * already past is on the plan board, and alerting it at every launch would be noise.
 */
export function createPlanAlerts(deps: PlanAlertDeps) {
  let plans = new Map<string, { bands: PlanBand[] }>();
  const lastPrice = new Map<string, number>();
  let alerted = new Set<string>();
  let alertedDay = '';
  let stopWatching: (() => void) | null = null;
  let watchedKey = '';
  let latestLoad = 0;

  function onPrice(symbol: string, price: number, session: string): void {
    const plan = plans.get(symbol);
    if (!plan || !Number.isFinite(price) || price <= 0) return;
    const prev = lastPrice.get(symbol);
    lastPrice.set(symbol, price);
    if (prev === undefined) return;
    const day = deps.today();
    if (day !== alertedDay) {
      alertedDay = day;
      alerted = new Set();
    }
    const fresh = crossedBands(prev, price, plan.bands).filter(
      (band) => !alerted.has(`${symbol}|${band.label}|${band.price}`),
    );
    if (!fresh.length) return;
    alerted = new Set([...alerted, ...fresh.map((band) => `${symbol}|${band.label}|${band.price}`)]);
    const text = describe(symbol, fresh, price, session, deps.english());
    deps.emit({
      symbol,
      kind: 'plan_level',
      title: text.title,
      body: text.body,
      at: new Date(deps.now()).toISOString(),
    });
  }

  /** True when the plans were loaded and are being watched. */
  async function reload(): Promise<boolean> {
    const load = ++latestLoad;
    let next: Map<string, { bands: PlanBand[] }>;
    try {
      next = await deps.loadPlans();
    } catch (error) {
      console.warn('[plan-alerts] could not load plans; keeping the last ones', error);
      return false;
    }
    // An older load that finished after a newer one must not overwrite it.
    if (load !== latestLoad) return true;
    plans = next;
    for (const symbol of [...lastPrice.keys()]) {
      if (!plans.has(symbol)) lastPrice.delete(symbol);
    }
    const symbols = [...plans.keys()].sort();
    const key = symbols.join(',');
    if (key === watchedKey) return true;
    try {
      // Start the new feed before stopping the old one, so symbols in both stay streaming.
      const started = symbols.length ? deps.watchPrices(symbols, onPrice) : null;
      stopWatching?.();
      stopWatching = started;
      watchedKey = key;
      return true;
    } catch (error) {
      console.warn('[plan-alerts] could not watch prices', error);
      return false;
    }
  }

  return {
    start: reload,
    reload,
    stop(): void {
      latestLoad += 1;
      stopWatching?.();
      stopWatching = null;
      watchedKey = '';
    },
  };
}

async function loadHoldingPlans(): Promise<Map<string, { bands: PlanBand[] }>> {
  const provider = getProvider();
  if (!provider.getPositions) return new Map();
  const positions = await provider.getPositions();
  const entries = await Promise.all(
    positions.map(async (position) => {
      const saved = await findSavedPlan(position.symbol).catch(() => null);
      const bands = saved?.plan.bands ?? [];
      return bands.length ? ([position.symbol, { bands }] as const) : null;
    }),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

function insideTestRun(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

let running: { stop(): void } | null = null;

/** Starts the level alerts for this process. Safe to call more than once. */
export async function startPlanAlerts(): Promise<void> {
  if (running || insideTestRun()) return;
  const alerts = createPlanAlerts({
    loadPlans: loadHoldingPlans,
    watchPrices: (symbols, onPrice) =>
      watchQuoteCells(symbols, (cell) => onPrice(cell.symbol, cell.last, cell.session)),
    emit: emitNotice,
    today: () => easternDate(),
    now: () => Date.now(),
    english: () => getInterfaceLocale() === 'en-US',
  });
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const offNotices = onAnyNotice((notice) => {
    if (notice.kind === 'analysis_done') void alerts.reload();
  });
  // Claimed before the first await, so a second call cannot start a second watcher.
  running = {
    stop() {
      for (const timer of timers) clearInterval(timer);
      offNotices();
      alerts.stop();
    },
  };
  const periodic = setInterval(() => void alerts.reload(), RELOAD_MS);
  periodic.unref?.();
  timers.push(periodic);
  if (await alerts.start()) return;
  const retry = setInterval(() => {
    void alerts.reload().then((ok) => {
      if (ok) clearInterval(retry);
    });
  }, START_RETRY_MS);
  retry.unref?.();
  timers.push(retry);
}

/** Stops the level alerts; the host calls this when it shuts down. */
export function stopPlanAlerts(): void {
  running?.stop();
  running = null;
}
