import type { PlanBoardRow } from '@kansoku/shared/types';
import { nextLevel, sideBands, type NextLevel } from '@kansoku/shared/planLevels';

/** A level this close (either way) is highlighted. */
export const NEAR_LEVEL_PCT = 3;

export interface BoardRow extends PlanBoardRow {
  /** Live price when the stream has one, else the positions snapshot. */
  price: number | null;
  nextBuy: NextLevel | null;
  nextSell: NextLevel | null;
  stop: NextLevel | null;
  /** The price is below the thesis stop: the add levels no longer apply. */
  stopBroken: boolean;
  /** A level is reached, or within NEAR_LEVEL_PCT. */
  near: boolean;
  /** Lower sorts first: −1 below the stop, 0 when a level is reached, else the closest distance. */
  urgency: number;
}

function withLevels(row: PlanBoardRow, live: number | undefined): BoardRow {
  const price = live && live > 0 ? live : row.price;
  const bands = row.plan?.bands ?? [];
  const nextBuy = price ? nextLevel(price, sideBands(bands, 'buy'), 'buy') : null;
  const nextSell = price ? nextLevel(price, sideBands(bands, 'sell'), 'sell') : null;
  const stop = price ? nextLevel(price, sideBands(bands, 'stop'), 'buy') : null;
  const levels = [nextBuy, nextSell].filter((level): level is NextLevel => level !== null);
  const reached = levels.some((level) => level.reached);
  const stopBroken = stop?.reached === true;
  const closest = levels.length
    ? Math.min(...levels.map((level) => Math.abs(level.distance_pct)))
    : Number.POSITIVE_INFINITY;
  return {
    ...row,
    price,
    nextBuy,
    nextSell,
    stop,
    stopBroken,
    near: stopBroken || reached || closest <= NEAR_LEVEL_PCT,
    urgency: stopBroken ? -1 : reached ? 0 : closest,
  };
}

/** Rows with their next levels at the live price, the most urgent first. */
export function boardRows(rows: readonly PlanBoardRow[], livePrices: Record<string, number>): BoardRow[] {
  return rows
    .map((row) => withLevels(row, livePrices[row.symbol]))
    .sort((a, b) => {
      if (!a.plan !== !b.plan) return a.plan ? -1 : 1;
      if (a.urgency !== b.urgency) return a.urgency - b.urgency;
      return a.symbol.localeCompare(b.symbol);
    });
}
