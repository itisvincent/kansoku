import type {
  ChartDoc,
  ScanItem,
  ScanSetup,
  ScanStartResult,
  WatchlistScanState,
} from '@kansoku/shared/types';
import { listCharts, loadChart } from '../../../charts/store.js';
import { getWatchSymbolsStrict } from '../../../overview/homeExtras.js';
import { getProvider } from '../../../marketdata/registry.js';
import { getWatchedMarketsOrDefault } from '../../../marketdata/watchedMarketsStore.js';
import { marketOf } from '../../../symbols/symbol.utils.js';
import { getInterfaceLocale } from '../../../settings/interfaceLocale.js';
import { sanitizeReassessTimeframes } from '../../agents/analysisTimeframes.js';
import { aiConfig } from '../../runtime/models.js';
import { startManualAnalystRun, type ManualRunRequest } from '../analyst/run.js';
import { emitNotice } from '../notices.js';
import { rankSetups, setupFromDoc } from './scanRanking.js';

/** Two at a time keeps the market-data CLI and the model provider from rate-limiting us. */
export const SCAN_CONCURRENCY = 2;
/** Each symbol is a full analyst run, so a scan is capped to keep the bill predictable. */
export const MAX_SCAN_SYMBOLS = 20;

type StartOutcome =
  | { started: true; done: Promise<void> }
  | { started: false; reason: string };

export interface ScanDeps {
  listSymbols: () => Promise<string[]>;
  /** False when no analyst model is configured; every run would fail the same way. */
  analystReady: () => boolean;
  startRun: (symbol: string, request: ManualRunRequest) => StartOutcome;
  /** The analysis chart this scan produced for the symbol, created at or after `since`. */
  findResult: (symbol: string, since: string) => Promise<{ chartId: string; doc: ChartDoc } | null>;
  notify: (state: WatchlistScanState) => void;
  now: () => number;
  concurrency: number;
  maxSymbols: number;
}

async function findLatestAnalystChart(
  symbol: string,
  since: string,
): Promise<{ chartId: string; doc: ChartDoc } | null> {
  const metas = await listCharts({ symbol, type: 'intraday', limit: 5 });
  for (const meta of metas) {
    if (meta.created_at < since) break;
    const doc = await loadChart(meta.id);
    if (doc?.input.origin === 'analyst') return { chartId: meta.id, doc };
  }
  return null;
}

function notifyFinished(state: WatchlistScanState): void {
  const en = getInterfaceLocale() === 'en-US';
  const done = state.items.filter((item) => item.status === 'done').length;
  const top = state.setups[0];
  const lead = top ? ` ${en ? 'Top' : '排第一'}: ${top.symbol}.` : '';
  emitNotice({
    symbol: top?.symbol ?? '',
    kind: 'analysis_done',
    title: en ? 'Watchlist scan finished' : '自选股扫描完成',
    body: en
      ? `${done} of ${state.items.length} symbols analysed.${lead}`
      : `已分析 ${done}/${state.items.length} 只。${lead}`,
    at: new Date().toISOString(),
  });
}

/**
 * Held positions first, so the cap never drops a stock you own, then the rest of the
 * watchlist. Only the configured watched markets are scanned (TD-LANG-03).
 */
export function orderScanSymbols(
  positions: readonly string[],
  watched: readonly string[],
  markets: readonly string[],
): string[] {
  const allowed = new Set(markets);
  return [...new Set([...positions, ...watched])].filter((symbol) => allowed.has(marketOf(symbol)));
}

async function listScanSymbols(): Promise<string[]> {
  const watched = await getWatchSymbolsStrict();
  const provider = getProvider();
  const positions = provider.getPositions
    ? (await provider.getPositions().catch(() => [])).map((position) => position.symbol)
    : [];
  return orderScanSymbols(positions, watched, getWatchedMarketsOrDefault());
}

export const defaultScanDeps: ScanDeps = {
  listSymbols: listScanSymbols,
  analystReady: () => aiConfig().analystModel != null,
  startRun: (symbol, request) => startManualAnalystRun(symbol, request),
  findResult: findLatestAnalystChart,
  notify: notifyFinished,
  now: () => Date.now(),
  concurrency: SCAN_CONCURRENCY,
  maxSymbols: MAX_SCAN_SYMBOLS,
};

function idleState(): WatchlistScanState {
  return {
    running: false,
    started_at: null,
    finished_at: null,
    timeframes: [],
    anchor_tf: null,
    items: [],
    setups: [],
    ranges: [],
    skipped_over_cap: 0,
  };
}

export function createWatchlistScanner(deps: ScanDeps) {
  let state: WatchlistScanState = idleState();
  let cancelled = false;
  let found: ScanSetup[] = [];
  /** Bumped per scan; a straggler from an older scan must not write into a newer one. */
  let generation = 0;

  const iso = () => new Date(deps.now()).toISOString();

  // Every update swaps in new objects so a status snapshot handed out earlier never changes.
  const patchItem = (symbol: string, patch: Partial<ScanItem>, gen: number) => {
    if (gen !== generation) return;
    state = {
      ...state,
      items: state.items.map((item) => (item.symbol === symbol ? { ...item, ...patch } : item)),
    };
  };

  const publishRanking = () => {
    state = { ...state, ...rankSetups(found) };
  };

  async function scanOne(symbol: string, request: ManualRunRequest, gen: number): Promise<void> {
    if (cancelled || gen !== generation) {
      patchItem(symbol, { status: 'cancelled' }, gen);
      return;
    }
    const since = iso();
    patchItem(symbol, { status: 'running', started_at: since }, gen);
    try {
      // startRun reads the AI settings synchronously and can throw; keep it inside the try.
      const run = deps.startRun(symbol, { ...request, quiet: true });
      if (!run.started) {
        patchItem(symbol, { status: 'skipped', reason: run.reason, finished_at: iso() }, gen);
        return;
      }
      await run.done;
      const result = await deps.findResult(symbol, since);
      const setup = result ? setupFromDoc(symbol, result.chartId, result.doc) : null;
      if (!setup) {
        patchItem(
          symbol,
          { status: 'failed', reason: 'no prediction was submitted', finished_at: iso() },
          gen,
        );
        return;
      }
      if (gen !== generation) return;
      found = [...found, setup];
      publishRanking();
      patchItem(symbol, { status: 'done', chart_id: setup.chart_id, finished_at: iso() }, gen);
    } catch (error) {
      patchItem(
        symbol,
        {
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
          finished_at: iso(),
        },
        gen,
      );
    }
  }

  async function runAll(symbols: string[], request: ManualRunRequest, gen: number): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.min(deps.concurrency, symbols.length) }, async () => {
      while (next < symbols.length) {
        const symbol = symbols[next++];
        await scanOne(symbol, request, gen);
      }
    });
    // allSettled: one failing worker must not mark the scan finished while another still runs.
    await Promise.allSettled(workers);
    if (gen !== generation) return;
    state = { ...state, running: false, finished_at: iso() };
    deps.notify(state);
  }

  return {
    status(): WatchlistScanState {
      return state;
    },

    async start(input: { timeframes?: string[]; anchorTf?: string }): Promise<ScanStartResult> {
      if (state.running) return { started: false, reason: 'busy' };
      if (!deps.analystReady()) return { started: false, reason: 'analyst layer disabled' };
      let symbols: string[];
      try {
        symbols = [...new Set(await deps.listSymbols())];
      } catch {
        return { started: false, reason: 'watchlist unavailable' };
      }
      if (state.running) return { started: false, reason: 'busy' };
      if (symbols.length === 0) return { started: false, reason: 'empty watchlist' };

      const timeframes = sanitizeReassessTimeframes(input.timeframes);
      const anchorTf =
        input.anchorTf && (timeframes as string[]).includes(input.anchorTf) ? input.anchorTf : null;
      const scanned = symbols.slice(0, deps.maxSymbols);
      generation += 1;
      const gen = generation;
      cancelled = false;
      found = [];
      state = {
        ...idleState(),
        running: true,
        started_at: iso(),
        timeframes: [...timeframes],
        anchor_tf: anchorTf,
        skipped_over_cap: symbols.length - scanned.length,
        items: scanned.map((symbol) => ({
          symbol,
          status: 'queued',
          chart_id: null,
          reason: null,
          started_at: null,
          finished_at: null,
        })),
      };
      const request: ManualRunRequest = {
        timeframes: [...timeframes],
        ...(anchorTf ? { anchorTimeframe: anchorTf } : {}),
      };
      void runAll(scanned, request, gen);
      return { started: true };
    },

    cancel(): WatchlistScanState {
      if (!state.running) return state;
      cancelled = true;
      state = {
        ...state,
        items: state.items.map((item) =>
          item.status === 'queued' ? { ...item, status: 'cancelled' } : item,
        ),
      };
      return state;
    },
  };

}

export const watchlistScanner = createWatchlistScanner(defaultScanDeps);
