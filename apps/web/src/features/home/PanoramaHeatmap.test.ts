import { describe, expect, it } from 'vitest';
import type { PortfolioSummary, QuoteCell } from '@kansoku/shared/types';
import { buildPanoramaGroups, type PanoramaGroup, type PanoramaTile } from './MarketPanorama';
import { layoutHeatmap, positionWeight, tileFontPx, watchWeight } from './PanoramaHeatmap';

const tile = (symbol: string, extra: Partial<PanoramaTile> = {}): PanoramaTile => ({
  symbol,
  pct: 1,
  turnover: 0,
  cap: null,
  owned: false,
  value: null,
  ...extra,
});

const group = (industry: string, tiles: PanoramaTile[]): PanoramaGroup => ({
  industry,
  turnover: 0,
  cap: 0,
  weightedPct: 1,
  tiles,
});

describe('layoutHeatmap', () => {
  const groups = [
    group('Semis', [tile('NVDA.US', { value: 900 }), tile('AVGO.US', { value: 600 })]),
    group('Food', [tile('MCD.US', { value: 300 }), tile('HSY.US', { value: 200 })]),
  ];

  it('keeps every tile inside the frame', () => {
    const { tiles } = layoutHeatmap(groups, positionWeight, 1000, 360);
    expect(tiles).toHaveLength(4);
    for (const { box } of tiles) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(1000.5);
      expect(box.y + box.h).toBeLessThanOrEqual(360.5);
    }
  });

  it('sizes positions by the money held in them', () => {
    const { tiles } = layoutHeatmap(groups, positionWeight, 1000, 360);
    const area = (s: string) => {
      const b = tiles.find((t) => t.tile.symbol === s)!.box;
      return b.w * b.h;
    };
    expect(area('NVDA.US')).toBeGreaterThan(area('AVGO.US'));
    expect(area('AVGO.US')).toBeGreaterThan(area('HSY.US'));
  });

  it('softens market cap so a giant does not flatten a small company', () => {
    const giant = tile('AAPL.US', { cap: 3e12 });
    const small = tile('AEHR.US', { cap: 1e9 });
    // Linear cap would be 3000:1; the square root is about 55:1.
    expect(watchWeight(giant) / watchWeight(small)).toBeCloseTo(Math.sqrt(3000), 0);
  });

  it('scales the label with the tile, within readable bounds', () => {
    expect(tileFontPx({ x: 0, y: 0, w: 30, h: 20 })).toBe(10);
    expect(tileFontPx({ x: 0, y: 0, w: 600, h: 400 })).toBe(22);
  });
});

describe('buildPanoramaGroups positions view', () => {
  it('shows every holding, even one whose quote has not arrived, and nothing else', () => {
    const quotes = [
      { symbol: 'NVDA.US', pct: 2, turnover: 1 } as QuoteCell,
      { symbol: 'MSFT.US', pct: 1, turnover: 1 } as QuoteCell, // watchlist only
    ];
    const portfolio = {
      positions: [
        { symbol: 'NVDA.US', market_value: 900 },
        { symbol: 'GRAB.US', market_value: -300 }, // a short; no quote yet
      ],
    } as unknown as PortfolioSummary;
    const groups = buildPanoramaGroups(quotes, portfolio, {}, { positionsOnly: true });
    const tiles = groups.flatMap((g) => g.tiles);
    expect(tiles.map((t) => t.symbol).sort()).toEqual(['GRAB.US', 'NVDA.US']);
    expect(tiles.find((t) => t.symbol === 'GRAB.US')).toMatchObject({ pct: null, value: 300 });
  });
});
