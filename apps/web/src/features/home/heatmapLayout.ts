import type { PanoramaGroup, PanoramaTile } from './MarketPanorama';
import { squarify } from './treemap';

/** How big a tile is: money held (positions) or a softened market cap (watchlist). */
export type TileWeight = (tile: PanoramaTile) => number;

export const positionWeight: TileWeight = (t) =>
  t.value != null && t.value > 0 ? t.value : t.cap && t.cap > 0 ? Math.sqrt(t.cap) : 1;

// Market cap to the power 0.4: a $3T company is about 13x a $5B one instead of 600x,
// so a long watchlist does not turn its smaller names into unreadable slivers.
const CAP_EXPONENT = 0.4;
export const watchWeight: TileWeight = (t) =>
  t.cap && t.cap > 0
    ? t.cap ** CAP_EXPONENT
    : t.turnover > 0
      ? t.turnover ** CAP_EXPONENT
      : 1;

/**
 * Frame height. Positions stay a wide, short strip; a long watchlist gets more height
 * (about 3.5px per stock, up to 900px) so its tiles are not chopped into slivers.
 */
export function heatmapHeight(width: number, tileCount: number, mode: 'positions' | 'watch'): number {
  const base = Math.min(520, Math.max(280, width * 0.36));
  if (mode === 'positions') return Math.round(base);
  return Math.round(Math.min(900, Math.max(base, 240 + tileCount * 3.5)));
}

export const HEADER_PX = 18;
const GAP_PX = 2;

export interface HeatmapBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HeatmapLayout {
  sectors: Array<{ group: PanoramaGroup; box: HeatmapBox; header: boolean }>;
  tiles: Array<{ tile: PanoramaTile; box: HeatmapBox }>;
}

/**
 * One treemap: sectors sized by their stocks' total weight, stocks laid out inside each
 * sector under a thin header. Replaces stacked square panels, which on a wide screen
 * made a two-stock sector a thousand pixels tall.
 */
export function layoutHeatmap(
  groups: PanoramaGroup[],
  weightOf: TileWeight,
  width: number,
  height: number,
): HeatmapLayout {
  const layout: HeatmapLayout = { sectors: [], tiles: [] };
  if (width <= 0 || height <= 0 || !groups.length) return layout;
  const weights = new Map(groups.map((g) => [g.industry, g.tiles.reduce((s, t) => s + weightOf(t), 0)]));
  const sectorRects = squarify(
    groups.map((g) => ({ key: g.industry, value: Math.max(weights.get(g.industry) ?? 0, 1e-9) })),
    width,
    height,
  );
  const byKey = new Map(groups.map((g) => [g.industry, g]));
  for (const rect of sectorRects) {
    const group = byKey.get(rect.key);
    if (!group) continue;
    const box = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    const header = rect.h >= HEADER_PX * 2.5 && rect.w >= 60;
    layout.sectors.push({ group, box, header });
    const inner = {
      x: rect.x + GAP_PX / 2,
      y: rect.y + (header ? HEADER_PX : GAP_PX / 2),
      w: Math.max(0, rect.w - GAP_PX),
      h: Math.max(0, rect.h - (header ? HEADER_PX + GAP_PX / 2 : GAP_PX)),
    };
    const tileRects = squarify(
      group.tiles.map((t) => ({ key: t.symbol, value: Math.max(weightOf(t), 1e-9) })),
      inner.w,
      inner.h,
    );
    const tilesByKey = new Map(group.tiles.map((t) => [t.symbol, t]));
    for (const r of tileRects) {
      const tile = tilesByKey.get(r.key);
      if (tile) layout.tiles.push({ tile, box: { x: inner.x + r.x, y: inner.y + r.y, w: r.w, h: r.h } });
    }
  }
  return layout;
}

/** Text size grows with the tile, within readable bounds. */
export function tileFontPx(box: HeatmapBox): number {
  return Math.round(Math.min(22, Math.max(10, Math.min(box.w / 5, box.h / 3))));
}

// Average glyph width as a share of the font size (bold sans for symbols, mono for %).
const SYMBOL_CHAR = 0.66;
const PCT_CHAR = 0.62;
const MIN_FONT = 9;
const PAD_PX = 6;

export interface TileLabels {
  symbolPx: number | null;
  pctPx: number | null;
}

/**
 * Font sizes that fit the tile, or null where the text cannot fit at a readable size.
 * Shrinking to fit (rather than clipping) is what stops "SQQQ" showing as "3QQ".
 */
export function fitTileLabels(box: HeatmapBox, symbol: string, pct: string): TileLabels {
  const room = box.w - PAD_PX;
  const base = tileFontPx(box);
  const symbolPx = Math.min(base, room / (symbol.length * SYMBOL_CHAR), box.h - 4);
  if (symbolPx < MIN_FONT) return { symbolPx: null, pctPx: null };
  const pctPx = Math.min(symbolPx * 0.72, room / (pct.length * PCT_CHAR));
  const fitsBoth = pctPx >= MIN_FONT && symbolPx * 1.15 + pctPx * 1.2 <= box.h - 4;
  return { symbolPx: Math.floor(symbolPx), pctPx: fitsBoth ? Math.floor(pctPx) : null };
}
