/**
 * Price levels from an EPS × PE plan: which side each one is on, which one is next from
 * the current price, and which ones a price move crossed. Shared by the plan board (server
 * and page) and the level alerts.
 */
import { marketDate } from './time.js';

/** buy: add on the way down; sell: trim on the way up; stop: the thesis breaks below it. */
export type BandSide = 'buy' | 'sell' | 'stop' | 'note';

export interface PlanBand {
  label: string;
  price: number;
  note?: string;
  /** Set by the analyst on newer plans; older plans are read from the label. */
  side?: BandSide;
}

export interface NextLevel {
  label: string;
  price: number;
  note?: string;
  /** Signed: level / price − 1, in percent. Negative for a level below the price. */
  distance_pct: number;
  /** The price is already through every level on this side; this is the furthest one. */
  reached: boolean;
}

export type PlanFreshness =
  | { state: 'fresh' }
  | { state: 'earnings_soon'; date: string; days: number }
  | { state: 'stale'; reason: 'earnings'; date: string }
  /** Made on the report day: right only if the analysis ran after the report came out. */
  | { state: 'stale'; reason: 'earnings_day'; date: string }
  | { state: 'stale'; reason: 'age'; days: number };

/** A plan older than this is flagged even when no earnings report has come out since. */
export const PLAN_MAX_AGE_DAYS = 30;
/** Earnings this close make the plan's levels likely to move soon. */
export const EARNINGS_SOON_DAYS = 14;

const DAY_MS = 86_400_000;
const SIDES: ReadonlySet<string> = new Set(['buy', 'sell', 'stop', 'note']);

const NOTE_RE =
  /(^|[\s,;(/-])(no|not|never|avoid|don't|dont|do not|stop add\w*|hold off)\b|不要|不加|不买|不减|不卖|别|勿|暂不|暂停|停止加|观望/;
const STOP_RE = /stop|cut loss|invalidat|thesis (is )?broken|thesis break|止损|证伪|破位/;
const SELL_RE = /trim|sell|reduce|take profit|减|卖|止盈/;
const BUY_RE = /add|buy|starter|reserve|加|买|建仓|补仓|增持/;

/**
 * The side of a level. An explicit side from the analyst wins; otherwise the free-text
 * label is read ("Starter buy", "Trim 2", "No starter", "Watch, do not add", "加仓").
 * Anything unclear is a note: a note is shown but never alerted, which is the safe miss.
 */
export function bandSide(label: string, side?: string): BandSide {
  if (side && SIDES.has(side)) return side as BandSide;
  const text = label.trim().toLowerCase().replace(/[‘’`]/g, "'");
  if (NOTE_RE.test(text)) return 'note';
  if (STOP_RE.test(text)) return 'stop';
  if (SELL_RE.test(text)) return 'sell';
  if (BUY_RE.test(text)) return 'buy';
  return 'note';
}

function sideOf(band: PlanBand): BandSide {
  return bandSide(band.label, band.side);
}

export function sideBands(bands: readonly PlanBand[], side: BandSide): PlanBand[] {
  return bands.filter(
    (band) => Number.isFinite(band.price) && band.price > 0 && sideOf(band) === side,
  );
}

function toNext(band: PlanBand, price: number, reached: boolean): NextLevel {
  return {
    label: band.label,
    price: band.price,
    ...(band.note ? { note: band.note } : {}),
    distance_pct: (band.price / price - 1) * 100,
    reached,
  };
}

/**
 * Buy side: the closest level below the price, or the deepest one if the price is already
 * below them all. Sell side mirrors it above the price.
 */
export function nextLevel(
  price: number,
  bands: readonly PlanBand[],
  side: 'buy' | 'sell',
): NextLevel | null {
  if (!Number.isFinite(price) || price <= 0 || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => a.price - b.price);
  if (side === 'buy') {
    const below = sorted.filter((band) => band.price < price);
    if (below.length) return toNext(below[below.length - 1], price, false);
    return toNext(sorted[0], price, true);
  }
  const above = sorted.filter((band) => band.price > price);
  if (above.length) return toNext(above[0], price, false);
  return toNext(sorted[sorted.length - 1], price, true);
}

/**
 * Levels a move from `prev` to `price` went through, in the order the price met them.
 * Touching a level counts, and so does leaving one the previous price sat exactly on.
 */
export function crossedBands(prev: number, price: number, bands: readonly PlanBand[]): PlanBand[] {
  if (!Number.isFinite(prev) || !Number.isFinite(price) || prev === price) return [];
  const down = price < prev;
  const crossed = bands.filter((band) => {
    const side = sideOf(band);
    if (side === 'note') return false;
    if (down) return side !== 'sell' && prev >= band.price && price <= band.price;
    return side === 'sell' && prev <= band.price && price >= band.price;
  });
  return crossed.sort((a, b) => (down ? b.price - a.price : a.price - b.price));
}

/**
 * Whether the plan's levels can still be trusted. `nextEarnings` is the report date the
 * analysis recorded; a plan made before that date predates the report once it has passed.
 */
export function planFreshness(
  madeAt: string,
  nextEarnings: string | null,
  today: string,
  nowMs: number,
): PlanFreshness {
  const made = Date.parse(madeAt);
  const madeDay = Number.isFinite(made) ? marketDate(madeAt) : today;
  if (nextEarnings && nextEarnings < today) {
    if (madeDay < nextEarnings) return { state: 'stale', reason: 'earnings', date: nextEarnings };
    if (madeDay === nextEarnings) {
      return { state: 'stale', reason: 'earnings_day', date: nextEarnings };
    }
  }
  const ageDays = Number.isFinite(made) ? Math.floor((nowMs - made) / DAY_MS) : 0;
  if (ageDays > PLAN_MAX_AGE_DAYS) return { state: 'stale', reason: 'age', days: ageDays };
  if (nextEarnings && nextEarnings >= today) {
    const days = Math.round((Date.parse(nextEarnings) - Date.parse(today)) / DAY_MS);
    if (days <= EARNINGS_SOON_DAYS) return { state: 'earnings_soon', date: nextEarnings, days };
  }
  return { state: 'fresh' };
}
