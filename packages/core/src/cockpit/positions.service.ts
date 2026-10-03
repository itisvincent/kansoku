import type { PortfolioSummary } from '@kansoku/shared/types';
import type { PositionsApi } from '../contract/positions.js';
import { ClientError } from '../platform/errors.js';
import { getProvider } from '../marketdata/registry.js';
import { onAccountCacheReset, resetAccountCaches } from '../marketdata/accountRefresh.js';
import { summarizePortfolio } from './positions.utils.js';
import { buildPlanBoard, findSavedPlan } from '../plans/planBoard.js';

const CACHE_TTL_MS = 30_000;

export function createPositionsService(): PositionsApi {
  let cache: { at: number; data: PortfolioSummary } | null = null;
  onAccountCacheReset(() => {
    cache = null;
  });

  const list = async () => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return cache.data;
    }
    const provider = getProvider();
    if (!provider.getPortfolio) {
      throw new ClientError(`provider ${provider.name} does not support portfolio`, undefined, 501);
    }
    const data = summarizePortfolio(await provider.getPortfolio());
    cache = { at: Date.now(), data };
    return data;
  };

  return {
    list,
    // The Refresh button: forget cached answers and remembered failures everywhere
    // (this cache, the Futu account cache and back-off, Longbridge's permission refusal).
    async refresh() {
      resetAccountCaches();
      return list();
    },
    plans() {
      return buildPlanBoard({
        listPositions: async () => (await list()).positions,
        findPlan: findSavedPlan,
        now: () => Date.now(),
      });
    },
  };
}
