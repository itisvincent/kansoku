import type { PlanBoard, PortfolioSummary } from '@kansoku/shared/types';
import { defineRoutes } from './defineRoutes.js';

export interface PositionsApi {
  list(): Promise<PortfolioSummary>;
  /** Reloads positions now, skipping every cache and remembered failure. */
  refresh(): Promise<PortfolioSummary>;
  /** Every holding with the price levels from its newest EPS × PE plan. */
  plans(): Promise<PlanBoard>;
}

export const positionsRoutes = defineRoutes<PositionsApi>('positions', {
  list: { method: 'GET', path: '/' },
  refresh: { method: 'POST', path: '/refresh' },
  plans: { method: 'GET', path: '/plans' },
});
