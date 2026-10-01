import { industryLabel } from '../../lib/marketLabels';
import { translate, type Locale } from '../../lib/i18n';
import { useLocale } from '../../lib/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { IndustryPanorama, PortfolioSummary, QuoteCell } from '@kansoku/shared/types';
import { industryOf, UNCLASSIFIED_INDUSTRY } from '@kansoku/shared/industryMap';
import { signed } from '@web/lib/format';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { NoteBlock } from '@web/ui';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { INDEX_SYMBOLS } from './HomeTopStrip';
import { isCardWorthySymbol } from './SymbolGrid';
import { squarify } from './treemap';
import { heatStyle } from './panoramaHeat';
import { PanoramaHeatmap, positionWeight, watchWeight } from './PanoramaHeatmap';
import { readStorage, writeStorage } from '@web/lib/safeStorage';

export interface PanoramaTile {
  symbol: string;
  pct: number | null;
  turnover: number;
  cap: number | null;
  owned: boolean;
  /** Money held in it (absolute market value), for held stocks. */
  value: number | null;
}

export interface PanoramaGroup {
  industry: string;
  turnover: number;
  cap: number;
  weightedPct: number | null;
  tiles: PanoramaTile[];
}

export function heatClass(pct: number | null): string {
  if (pct == null) return 'heat-0';
  if (pct >= 4) return 'heat-g3';
  if (pct >= 1.5) return 'heat-g2';
  if (pct > 0.2) return 'heat-g1';
  if (pct <= -4) return 'heat-r3';
  if (pct <= -1.5) return 'heat-r2';
  if (pct < -0.2) return 'heat-r1';
  return 'heat-0';
}

export function buildPanoramaGroups(
  quotes: QuoteCell[],
  portfolio: PortfolioSummary | null,
  caps: Record<string, number> = {},
  options: { positionsOnly?: boolean } = {},
): PanoramaGroup[] {
  const held = new Map((portfolio?.positions ?? []).map((p) => [p.symbol, p]));
  const indexSet = new Set(INDEX_SYMBOLS);
  const byIndustry = new Map<string, PanoramaTile[]>();
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  // Positions view: every holding, even one whose live quote has not arrived yet.
  const symbols = options.positionsOnly
    ? [...held.keys()]
    : quotes.map((q) => q.symbol);
  for (const symbol of symbols) {
    if (indexSet.has(symbol) || !isCardWorthySymbol(symbol)) continue;
    const q = quoteBySymbol.get(symbol);
    const position = held.get(symbol);
    const tile: PanoramaTile = {
      symbol,
      pct: q?.pct ?? null,
      turnover: q?.turnover ?? 0,
      cap: caps[symbol] ?? null,
      owned: position !== undefined,
      value: position ? Math.abs(position.market_value) : null,
    };
    const industry = industryOf(symbol);
    const list = byIndustry.get(industry);
    if (list) list.push(tile);
    else byIndustry.set(industry, [tile]);
  }
  const groups = [...byIndustry.entries()].map(([industry, tiles]) => {
    tiles.sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0) || b.turnover - a.turnover);
    const turnover = tiles.reduce((s, t) => s + t.turnover, 0);
    const cap = tiles.reduce((s, t) => s + (t.cap ?? 0), 0);
    const weighted = tiles.filter((t) => t.pct != null && t.turnover > 0);
    const weightSum = weighted.reduce((s, t) => s + t.turnover, 0);
    const weightedPct = weightSum
      ? weighted.reduce((s, t) => s + t.pct! * t.turnover, 0) / weightSum
      : null;
    return { industry, turnover, cap, weightedPct, tiles };
  });
  return groups.sort((a, b) => {
    if ((a.industry === UNCLASSIFIED_INDUSTRY) !== (b.industry === UNCLASSIFIED_INDUSTRY)) {
      return a.industry === UNCLASSIFIED_INDUSTRY ? 1 : -1;
    }
    return b.cap - a.cap || b.turnover - a.turnover;
  });
}

const TOOL_INDUSTRIES = new Set(['现金类', '波动率', UNCLASSIFIED_INDUSTRY]);
const MERGE_BELOW = 3;

export function splitPanorama(groups: PanoramaGroup[]): {
  main: PanoramaGroup[];
  tools: PanoramaGroup[];
} {
  const tools = groups.filter((g) => TOOL_INDUSTRIES.has(g.industry));
  const rest = groups.filter((g) => !TOOL_INDUSTRIES.has(g.industry));
  const main = rest.filter((g) => g.tiles.length >= MERGE_BELOW);
  const small = rest.filter((g) => g.tiles.length < MERGE_BELOW);
  if (small.length === 1) main.push(small[0]);
  else if (small.length > 1) {
    const tiles = small
      .flatMap((g) => g.tiles)
      .sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0) || b.turnover - a.turnover);
    main.push({
      industry: small.map((g) => g.industry).join(' · '),
      turnover: small.reduce((s, g) => s + g.turnover, 0),
      cap: small.reduce((s, g) => s + g.cap, 0),
      weightedPct: null,
      tiles,
    });
  }
  return { main, tools };
}

export function panoramaReadLine(groups: PanoramaGroup[], locale: Locale = 'zh-CN'): string | null {
  const rated = groups.filter((g) => g.weightedPct != null && !TOOL_INDUSTRIES.has(g.industry));
  if (rated.length < 2) return null;
  const top = rated.reduce((a, b) => (b.weightedPct! > a.weightedPct! ? b : a));
  const bottom = rated.reduce((a, b) => (b.weightedPct! < a.weightedPct! ? b : a));
  if (top === bottom) return null;
  return translate(locale, 'homePanoramaSummary', {
    top: industryLabel(top.industry, locale),
    topPct: signed(top.weightedPct!),
    bottom: industryLabel(bottom.industry, locale),
    bottomPct: signed(bottom.weightedPct!),
  });
}

const styles = stylex.create({
  number: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  positive: {
    color: colors.up,
  },
  negative: {
    color: colors.down,
  },
  tabs: {
    display: 'flex',
    gap: '6px',
    marginBottom: '8px',
  },
  tab: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: 0,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: fonts.ui,
    fontSize: fontSizes.sm,
    padding: '3px 12px',
  },
  tabActive: {
    backgroundColor: colors.backgroundElement,
    borderColor: colors.borderStrong,
    color: colors.textPrimary,
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  row: {
    'display': 'grid',
    'gap': '6px',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  sector: {
    aspectRatio: '1 / 1',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: 0,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
  },
  sectorHead: {
    alignItems: 'baseline',
    backgroundColor: colors.backgroundElement,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    fontSize: fontSizes.sm,
    justifyContent: 'space-between',
    padding: '3px 8px',
  },
  sectorName: {
    color: colors.textSecondary,
    fontWeight: 600,
  },
  sectorBody: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  industryWrap: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    position: 'relative',
  },
  treemap: {
    position: 'relative',
  },
  industryTreemap: {
    inset: 0,
    position: 'absolute',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    justifyContent: 'center',
    outlineColor: colors.border,
    outlineOffset: '-1px',
    outlineStyle: 'solid',
    outlineWidth: '1px',
    overflow: 'hidden',
    padding: '3px 6px',
    position: 'absolute',
    textDecoration: 'none',
    transition: 'background-color 150ms ease',
    fontVariantNumeric: 'tabular-nums',
  },
  tileDense: {
    justifyContent: 'flex-start',
    padding: '2px 4px',
  },
  tileOwned: {
    outlineColor: colors.accent,
    outlineOffset: '-1.5px',
    outlineWidth: '1.5px',
  },
  sym: {
    fontSize: fontSizes.sm,
    fontWeight: 700,
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  symDense: {
    fontSize: fontSizes.xs,
    lineHeight: 1.15,
  },
  pct: {
    fontSize: fontSizes.xs,
    opacity: 0.9,
  },
  tileSub: {
    color: 'currentColor',
    fontSize: fontSizes.xs,
    lineHeight: 1.1,
    marginTop: '1px',
    opacity: 0.72,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chips: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '6px',
  },
  chip: {
    alignItems: 'center',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textMuted,
    display: 'inline-flex',
    fontFamily: fonts.ui,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    gap: '8px',
    padding: '3px 9px',
  },
  chipLink: {
    'color': colors.textSecondary,
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
  chipLabel: {
    fontWeight: 600,
  },
  sectorRead: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: '6px',
  },
});


function sortByPct(tiles: PanoramaTile[]): PanoramaTile[] {
  return [...tiles].sort((a, b) => (b.pct ?? -Infinity) - (a.pct ?? -Infinity));
}

function ToolChips({ tools }: { tools: PanoramaGroup[] }) {
  const { locale } = useLocale();
  if (!tools.length) return null;
  return (
    <div className={`pano-chips ${stylex.props(styles.chips).className}`}>
      {tools.map((g) => (
        <span
          className={`pano-chip ${stylex.props(styles.chip).className}`}
          key={industryLabel(g.industry, locale)}
        >
          <span className={`pano-chip-label ${stylex.props(styles.chipLabel).className}`}>
            {g.industry}
          </span>
          {sortByPct(g.tiles).map((t) => (
            <a
              key={t.symbol}
              className={
                stylex.props(
                  styles.number,
                  styles.chipLink,
                  t.pct != null && t.pct > 0.2 && styles.positive,
                  t.pct != null && t.pct < -0.2 && styles.negative,
                ).className
              }
              href={`/symbol/${encodeURIComponent(t.symbol)}`}
            >
              {t.symbol.replace(/\.US$/, '')} {t.pct == null ? '—' : `${signed(t.pct)}%`}
            </a>
          ))}
        </span>
      ))}
    </div>
  );
}

function useMeasured(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

function WatchPanorama({
  quotes,
  portfolio,
  caps,
  positionsOnly = false,
}: {
  quotes: QuoteCell[];
  portfolio: PortfolioSummary | null;
  caps: Record<string, number>;
  positionsOnly?: boolean;
}) {
  const { t: i18n, locale } = useLocale();
  const groups = useMemo(
    () => buildPanoramaGroups(quotes, portfolio, caps, { positionsOnly }),
    [quotes, portfolio, caps, positionsOnly],
  );
  const { main, tools } = useMemo(() => splitPanorama(groups), [groups]);
  if (!groups.length) {
    return (
      <NoteBlock>
        {i18n(positionsOnly ? 'homePanoramaNoPositions' : 'homePanoramaWaitingForQuotes')}
      </NoteBlock>
    );
  }
  const line = panoramaReadLine(groups, locale);
  return (
    <>
      <PanoramaHeatmap
        groups={main}
        weightOf={positionsOnly ? positionWeight : watchWeight}
        markOwned={!positionsOnly}
      />
      <ToolChips tools={tools} />
      {line && (
        <div className={`sector-read ${stylex.props(styles.sectorRead).className}`}>↳ {line}</div>
      )}
    </>
  );
}

function IndustryTreemap({ items }: { items: IndustryPanorama['items'] }) {
  const { t: i18n, locale } = useLocale();
  const [ref, size] = useMeasured();
  const { w, h } = size;
  const rects = useMemo(() => {
    if (w <= 0 || h <= 0) return [];
    return squarify(
      items.map((r) => ({ key: r.name, value: Math.abs(r.chg ?? 0) + 0.01 })),
      w,
      h,
    );
  }, [items, w, h]);
  const byKey = new Map(rects.map((r) => [r.key, r]));
  return (
    <div
      className={`pano-treemap ${stylex.props(styles.treemap, styles.industryTreemap).className}`}
      ref={ref}
    >
      {items.map((row) => {
        const rect = byKey.get(row.name);
        if (!rect || rect.w < 4 || rect.h < 4) return null;
        const dense = rect.w * rect.h < 1600;
        return (
          <div
            key={industryLabel(row.name, locale)}
            className={`pano-tile ${heatClass(row.chg)}${dense ? ' pano-tile--dense' : ''} ${stylex.props(styles.tile, heatStyle(row.chg), dense && styles.tileDense).className}`}
            style={{
              left: `${rect.x}px`,
              top: `${rect.y}px`,
              width: `${rect.w}px`,
              height: `${rect.h}px`,
            }}
            title={`${industryLabel(row.name, locale)}${row.chg == null ? '' : ` ${signed(row.chg)}%`}${row.leading_ticker ? ` · ${i18n('homeLeadingTicker', { symbol: row.leading_ticker })}${row.leading_chg != null ? ` ${signed(row.leading_chg)}%` : ''}` : ''}`}
          >
            <span
              className={`pano-sym ${stylex.props(styles.sym, dense && styles.symDense).className}`}
            >
              {row.name}
            </span>
            {!dense && (
              <span className={`pano-pct ${stylex.props(styles.number, styles.pct).className}`}>
                {row.chg == null ? '—' : `${signed(row.chg)}%`}
              </span>
            )}
            {!dense && row.leading_ticker && (
              <span className={`pano-tile-sub ${stylex.props(styles.tileSub).className}`}>
                {row.leading_ticker}
                {row.leading_chg != null ? ` ${signed(row.leading_chg)}%` : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IndustryPanoramaView() {
  const { t: i18n } = useLocale();
  const { data, error } = usePollingQuery<IndustryPanorama>(
    'overview.industries',
    () => client.overview.industries(),
    10 * 60_000,
  );
  if (error) return <NoteBlock>{i18n('homeIndustryDataRetry')}</NoteBlock>;
  if (!data) return <NoteBlock>{i18n('homeIndustryDataLoading')}</NoteBlock>;
  if (!data.items.length) return <NoteBlock>{i18n('homeNoIndustryData')}</NoteBlock>;
  return (
    <div
      className={`pano-industry-wrap ${stylex.props(styles.industryWrap).className}`}
      style={{ height: '320px' }}
    >
      <IndustryTreemap items={data.items} />
    </div>
  );
}

type PanoramaTab = 'positions' | 'watch' | 'market';
const PANORAMA_TAB_KEY = 'home-panorama-tab';

function readPanoramaTab(): PanoramaTab {
  const saved = readStorage(PANORAMA_TAB_KEY);
  return saved === 'positions' || saved === 'market' ? saved : 'watch';
}

export function MarketPanorama({
  quotes,
  portfolio,
  caps = {},
}: {
  quotes: QuoteCell[];
  portfolio: PortfolioSummary | null;
  caps?: Record<string, number>;
}) {
  const { t: i18n } = useLocale();
  const [tab, setTab] = useState<PanoramaTab>(() => readPanoramaTab());
  const chooseTab = (next: PanoramaTab) => {
    setTab(next);
    writeStorage(PANORAMA_TAB_KEY, next);
  };
  const tabs: Array<[PanoramaTab, string]> = [
    ['positions', i18n('homePositionsOnly')],
    ['watch', i18n('homeWatchlistAndPositions')],
    ['market', i18n('homeWholeMarket')],
  ];
  return (
    <div className="market-panorama">
      <div className={`pano-tabs ${stylex.props(styles.tabs).className}`}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`pano-tab${tab === key ? ' pano-tab--active' : ''} ${stylex.props(styles.tab, tab === key && styles.tabActive).className}`}
            onClick={() => chooseTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'market' ? (
        <IndustryPanoramaView />
      ) : (
        <WatchPanorama
          quotes={quotes}
          portfolio={portfolio}
          caps={caps}
          positionsOnly={tab === 'positions'}
        />
      )}
    </div>
  );
}
