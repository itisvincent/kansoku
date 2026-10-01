import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { industryLabel } from '../../lib/marketLabels';
import { useLocale } from '../../lib/i18n';
import { signed } from '@web/lib/format';
import { Tooltip } from '@web/ui';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { heatStyle } from './panoramaHeat';
import { squarify } from './treemap';
import type { PanoramaGroup, PanoramaTile } from './MarketPanorama';

/** How big a tile is: money held (positions) or a softened market cap (watchlist). */
export type TileWeight = (tile: PanoramaTile) => number;

export const positionWeight: TileWeight = (t) =>
  t.value != null && t.value > 0 ? t.value : t.cap && t.cap > 0 ? Math.sqrt(t.cap) : 1;

// The square root keeps a $3T company from flattening a $5B one into a sliver.
export const watchWeight: TileWeight = (t) =>
  t.cap && t.cap > 0 ? Math.sqrt(t.cap) : t.turnover > 0 ? Math.sqrt(t.turnover) : 1;

const HEADER_PX = 18;
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

const styles = stylex.create({
  frame: {
    backgroundColor: colors.backgroundCanvas,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  sectorHead: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    fontWeight: 600,
    gap: '6px',
    height: `${HEADER_PX}px`,
    overflow: 'hidden',
    paddingInline: '4px',
    position: 'absolute',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sectorPct: {
    fontFamily: fonts.mono,
    fontWeight: 500,
  },
  positive: { color: colors.up },
  negative: { color: colors.down },
  tile: {
    alignItems: 'center',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    lineHeight: 1.15,
    outlineColor: colors.backgroundCanvas,
    outlineOffset: '-1px',
    outlineStyle: 'solid',
    outlineWidth: '1px',
    overflow: 'hidden',
    position: 'absolute',
    textAlign: 'center',
    textDecoration: 'none',
    fontVariantNumeric: 'tabular-nums',
  },
  owned: {
    outlineColor: colors.accent,
    outlineOffset: '-2px',
    outlineWidth: '2px',
  },
  sym: {
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  pct: {
    fontFamily: fonts.mono,
    opacity: 0.9,
    whiteSpace: 'nowrap',
  },
});

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function PanoramaHeatmap({
  groups,
  weightOf,
  markOwned = true,
}: {
  groups: PanoramaGroup[];
  weightOf: TileWeight;
  /** Outline held stocks; pointless when every tile is a position. */
  markOwned?: boolean;
}) {
  const { locale } = useLocale();
  const [ref, width] = useWidth();
  // A wide, short frame like a market heatmap; bounded so it never fills the screen.
  const height = Math.round(Math.min(520, Math.max(280, width * 0.36)));
  const layout = useMemo(
    () => layoutHeatmap(groups, weightOf, width, height),
    [groups, weightOf, width, height],
  );

  return (
    <div
      ref={ref}
      className={`pano-heatmap ${stylex.props(styles.frame).className}`}
      style={{ height: `${height}px` }}
    >
      {layout.sectors
        .filter((s) => s.header)
        .map(({ group, box }) => (
          <div
            key={`head-${group.industry}`}
            className={`pano-heatmap-head ${stylex.props(styles.sectorHead).className}`}
            style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px` }}
          >
            <span>{industryLabel(group.industry, locale)}</span>
            {group.weightedPct != null && (
              <span
                {...stylex.props(
                  styles.sectorPct,
                  group.weightedPct >= 0 ? styles.positive : styles.negative,
                )}
              >
                {signed(group.weightedPct)}%
              </span>
            )}
          </div>
        ))}
      {layout.tiles.map(({ tile, box }) => {
        if (box.w < 3 || box.h < 3) return null;
        const font = tileFontPx(box);
        const label = tile.symbol.replace(/\.US$/, '');
        const pctLabel = tile.pct == null ? '—' : `${signed(tile.pct)}%`;
        const showSym = box.w >= font * 1.6 && box.h >= font * 1.1;
        const showPct = showSym && box.h >= font * 2.4 && box.w >= font * 3;
        return (
          <Tooltip
            key={tile.symbol}
            content={`${tile.symbol}\n${pctLabel}`}
            renderTrigger={
              <a
                aria-label={`${tile.symbol} ${pctLabel}`}
                className={`pano-heat-tile ${stylex.props(styles.tile, heatStyle(tile.pct), markOwned && tile.owned && styles.owned).className}`}
                href={`/symbol/${encodeURIComponent(tile.symbol)}`}
                style={{
                  left: `${box.x}px`,
                  top: `${box.y}px`,
                  width: `${box.w}px`,
                  height: `${box.h}px`,
                  fontSize: `${font}px`,
                }}
              />
            }
          >
            {showSym && <span {...stylex.props(styles.sym)}>{label}</span>}
            {showPct && (
              <span {...stylex.props(styles.pct)} style={{ fontSize: `${Math.max(10, Math.round(font * 0.72))}px` }}>
                {pctLabel}
              </span>
            )}
          </Tooltip>
        );
      })}
    </div>
  );
}
