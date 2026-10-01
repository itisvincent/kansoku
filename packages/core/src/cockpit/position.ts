import type { CockpitPosition } from '@kansoku/shared/types';
import type { RawPosition } from '../marketdata/types.js';

export function buildCockpitPosition(
  positions: RawPosition[],
  symbol: string,
  last: number,
  plan?: { stop?: number; target1?: number; target2?: number } | null,
): CockpitPosition | null {
  const position = positions.find((p) => p.symbol === symbol);
  if (!position) return null;
  const shares = Number(position.quantity);
  if (shares === 0) return null;

  const cost = Number(position.cost_price);
  const unrealized = (last - cost) * shares;
  // A short (negative quantity) gains when the price falls below cost.
  const unrealizedPct = cost > 0 ? Math.sign(shares) * (last / cost - 1) * 100 : 0;

  const distances = plan
    ? {
        stop_pct: plan.stop !== undefined ? (plan.stop / last - 1) * 100 : null,
        target1_pct: plan.target1 !== undefined ? (plan.target1 / last - 1) * 100 : null,
        target2_pct: plan.target2 !== undefined ? (plan.target2 / last - 1) * 100 : null,
      }
    : null;

  return { symbol, shares, cost, last, unrealized, unrealizedPct, distances };
}
