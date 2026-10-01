import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { industryLabel } from '../../lib/marketLabels';
import { useLocale } from '../../lib/i18n';
import { signed } from '@web/lib/format';
import { Tooltip } from '@web/ui';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { heatStyle } from './panoramaHeat';
import type { PanoramaGroup } from './MarketPanorama';
import { fitTileLabels, heatmapHeight, layoutHeatmap, type TileWeight } from './heatmapLayout';

const styles = stylex.create({
  frame: {
    backgroundColor: colors.backgroundCanvas,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  sectorName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sectorHead: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    fontWeight: 600,
    gap: '6px',
    height: '18px', // = HEADER_PX in heatmapLayout.ts
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
  const tileCount = groups.reduce((n, g) => n + g.tiles.length, 0);
  const height = heatmapHeight(width, tileCount, markOwned ? 'watch' : 'positions');
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
            <span {...stylex.props(styles.sectorName)}>{industryLabel(group.industry, locale)}</span>
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
        const label = tile.symbol.replace(/\.US$/, '');
        const pctLabel = tile.pct == null ? '—' : `${signed(tile.pct)}%`;
        const fit = fitTileLabels(box, label, pctLabel);
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
                }}
              />
            }
          >
            {fit.symbolPx != null && (
              <span {...stylex.props(styles.sym)} style={{ fontSize: `${fit.symbolPx}px` }}>
                {label}
              </span>
            )}
            {fit.pctPx != null && (
              <span {...stylex.props(styles.pct)} style={{ fontSize: `${fit.pctPx}px` }}>
                {pctLabel}
              </span>
            )}
          </Tooltip>
        );
      })}
    </div>
  );
}
