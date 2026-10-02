import type { PortfolioSummary } from '@kansoku/shared/types';
import { defineRoutes } from './defineRoutes.js';

export interface PositionsApi {
  list(): Promise<PortfolioSummary>;
  /** Reloads positions now, skipping every cache and remembered failure. */
  refresh(): Promise<PortfolioSummary>;
}

export const positionsRoutes = defineRoutes<PositionsApi>('positions', {
  list: { method: 'GET', path: '/' },
  refresh: { method: 'POST', path: '/refresh' },
});
