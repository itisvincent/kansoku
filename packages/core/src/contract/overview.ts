import type {
  AiUsageSummary,
  HomeEvents,
  IndustryPanorama,
  OverviewBoard,
  OverviewRecap,
  PredictionScorecard,
  PredictionStats,
  ScanStartResult,
  WatchlistScanState,
} from '@kansoku/shared/types';
import { defineRoutes } from './defineRoutes.js';

export interface OverviewApi {
  board(): Promise<OverviewBoard>;
  events(): Promise<HomeEvents>;
  industries(): Promise<IndustryPanorama>;
  recap(input: { date?: string }): Promise<OverviewRecap>;
  stats(): Promise<PredictionStats>;
  /** AI prediction hit rates split by anchor timeframe, direction and window set. */
  scorecard(input: { days?: number }): Promise<PredictionScorecard>;
  usage(input: { date?: string }): Promise<AiUsageSummary>;
  /** Runs the AI analyst over the watchlist in the background and ranks the setups. */
  scanStart(input: {
    timeframes?: string[];
    anchorTf?: string;
    /** 'positions' analyses only held positions; the default is the watchlist. */
    scope?: 'watchlist' | 'positions';
  }): Promise<ScanStartResult>;
  scanStatus(): Promise<WatchlistScanState>;
  /** Stops queued symbols; runs already in flight finish on their own. */
  scanCancel(): Promise<WatchlistScanState>;
  recapDates(): Promise<string[]>;
}

export const overviewRoutes = defineRoutes<OverviewApi>('overview', {
  board: { method: 'GET', path: '/' },
  events: { method: 'GET', path: '/events' },
  industries: { method: 'GET', path: '/industries' },
  recap: { method: 'GET', path: '/recap' },
  stats: { method: 'GET', path: '/stats' },
  scorecard: { method: 'GET', path: '/scorecard' },
  usage: { method: 'GET', path: '/usage' },
  scanStart: { method: 'POST', path: '/scan' },
  scanStatus: { method: 'GET', path: '/scan' },
  scanCancel: { method: 'POST', path: '/scan/cancel' },
  recapDates: { method: 'GET', path: '/recap-dates' },
});
