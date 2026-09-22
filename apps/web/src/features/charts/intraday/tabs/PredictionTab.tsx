import { useLocale } from '@web/lib/i18n';
import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import type { IntradayBuilt, IntradayTfSummary } from '@kansoku/shared/types';
import { fmt, signed } from '@web/lib/format';
import { tfDataOf, tfLabel, type ChartTf } from '../timeframes';
import { useIntradayControls } from '../controlsContext';
import { conclusionOutdated, ReassessCta, type ConclusionReassess } from '../ConclusionCard';
import { DIRECTION_LABEL } from '../directionLabels';
import {
  AutoSignalItem,
  Pattern123Item,
  PriceZoneCard,
  TargetContextCard,
  TechRow,
} from './predictionTabParts';
import { MarketTime, SectionTitle, TimeAgo } from '@web/ui';
import { colors, fontSizes, radii } from '../../../../theme/tokens.stylex';

const SIGNAL_ICON: Record<string, string> = {
  pin_bar: '📌',
  macd_divergence: '⚡',
  macd_beichi: '🌀',
};

function techSummary(built: IntradayBuilt, tf: ChartTf): IntradayTfSummary | undefined {
  const stored = (built.sidebar.technicals as Record<string, IntradayTfSummary | undefined>)[tf];
  if (stored) return stored;
  const data = tfDataOf(built, tf);
  if (!data) return undefined;
  return {
    last_dif: data.macdDif.at(-1)?.value ?? null,
    last_dea: data.macdDea.at(-1)?.value ?? null,
    last_hist: data.macdHist.at(-1)?.value ?? null,
    emas: [],
    recent_swing_highs: [],
    recent_swing_lows: [],
    last_cross: null,
    divergence_candidates: [],
    beichi_candidates: [],
  };
}

const styles = stylex.create({
  icon: {
    verticalAlign: '-2px',
  },
  verdict: {
    borderStyle: 'solid',
    borderWidth: '1px',
    marginBottom: '14px',
    padding: '12px',
  },
  verdictUp: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.up} 14%, transparent), color-mix(in srgb, ${colors.up} 4%, transparent))`,
    borderColor: colors.up,
  },
  verdictDown: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.down} 14%, transparent), color-mix(in srgb, ${colors.down} 4%, transparent))`,
    borderColor: colors.down,
  },
  verdictNeutral: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.textSecondary} 14%, transparent), color-mix(in srgb, ${colors.textSecondary} 4%, transparent))`,
    borderColor: colors.textSecondary,
  },
  verdictLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  predictionAge: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 'normal',
    marginLeft: '6px',
    textTransform: 'none',
  },
  staleBadge: {
    backgroundColor: 'rgba(255, 176, 0, 0.15)',
    borderColor: 'rgba(255, 176, 0, 0.4)',
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.accent,
    fontSize: fontSizes.sm,
    fontWeight: 600,
    letterSpacing: 'normal',
    marginLeft: '6px',
    padding: '1px 6px',
    textTransform: 'none',
  },
  verdictText: {
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginTop: '4px',
  },
  verdictTextUp: { color: colors.up },
  verdictTextDown: { color: colors.down },
  verdictTextNeutral: { color: colors.textSecondary },
  verdictReason: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    lineHeight: 1.5,
    marginTop: '6px',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    letterSpacing: '0.06em',
    marginBottom: '6px',
    marginTop: '10px',
    textTransform: 'uppercase',
  },
  planExplain: {
    marginTop: '8px',
  },
  grid: {
    display: 'grid',
    fontSize: fontSizes.base,
    gap: '6px 10px',
    gridTemplateColumns: 'auto 1fr',
  },
  gridKey: { color: colors.textSecondary },
  gridValue: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  gridValueLeft: { textAlign: 'left' },
  toneUp: { color: colors.up },
  toneDown: { color: colors.down },
  gridAfterNote: { marginTop: '6px' },
  checkItem: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    display: 'flex',
    gap: '10px',
    marginBottom: '4px',
    padding: '7px 8px',
  },
  checkIcon: {
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSizes.md,
  },
  checkLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 500,
  },
  checkValue: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    marginTop: '2px',
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.4,
    marginTop: '6px',
  },
  noteStrong: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.textPrimary,
    padding: '7px 8px',
  },
  warning: { color: colors.down },
  zoneItem: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '3px',
    display: 'block',
    marginBottom: '6px',
    padding: '8px 10px',
  },
  zoneHead: {
    alignItems: 'baseline',
    display: 'flex',
    justifyContent: 'space-between',
  },
  zoneLabel: {
    color: colors.accent,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  zoneLabelPlain: { color: colors.textPrimary },
  zoneRange: {
    color: colors.textPrimary,
    fontSize: fontSizes.control,
    fontVariantNumeric: 'tabular-nums',
  },
  zoneRangeAccent: {
    color: colors.accent,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  zoneMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.45,
    marginTop: '3px',
  },
  zoneMetaMd: { fontSize: fontSizes.control },
  zoneMetaAfter: { marginBottom: '6px' },
});

function directionStyles(direction: string | undefined) {
  if (direction === 'long') {
    return { frame: styles.verdictUp, text: styles.verdictTextUp };
  }
  if (direction === 'short') {
    return { frame: styles.verdictDown, text: styles.verdictTextDown };
  }
  return { frame: styles.verdictNeutral, text: styles.verdictTextNeutral };
}

function rrTone(ep: { rr_great: boolean; rr_ok: boolean }): string {
  if (ep.rr_great) return 'up';
  return ep.rr_ok ? '' : 'down';
}

interface PredictionTabProps {
  built: IntradayBuilt;
  activeTf: ChartTf;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  reassess?: ConclusionReassess;
  emptyCta?: ReactNode;
}

export function PredictionTab({
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  reassess,
  emptyCta,
}: PredictionTabProps) {
  const { t: i18n, locale } = useLocale();
  const { analysisTfs } = useIntradayControls();
  const s = built.sidebar;
  const p = s.prediction;
  const ep = s.entryPlan;
  const scenarios = (p?.scenarios ?? []).map((sc) => {
    const raw = sc as unknown as Record<string, unknown>;
    const label =
      typeof sc.label === 'string' && sc.label
        ? sc.label
        : typeof raw.name === 'string'
          ? (raw.name as string)
          : '';
    const probRaw =
      typeof sc.probability === 'number' && Number.isFinite(sc.probability)
        ? sc.probability
        : typeof raw.prob === 'number' && Number.isFinite(raw.prob as number)
          ? (raw.prob as number)
          : 0;
    const probability = probRaw > 0 && probRaw <= 1 ? probRaw * 100 : probRaw;
    return { ...sc, label, probability };
  });
  const totalProb = scenarios.reduce((acc, sc) => acc + Number(sc.probability || 0), 0);
  const rbp = p?.range_bound_plan;
  const signals = p?.signals ?? [];
  const targetContexts = ep?.target_contexts ?? [];
  const priceZones = (ep?.price_zones ?? []).filter((zone) => zone.kind === 'resistance');
  const verdictTone = directionStyles(p?.direction);

  return (
    <>
      {p ? (
        <div className={`verdict ${stylex.props(styles.verdict, verdictTone.frame).className}`}>
          <div className={`verdict-label ${stylex.props(styles.verdictLabel).className}`}>
            {i18n('chartShortDirection')}
            {predictionStale ? (
              <span className={`stale-badge ${stylex.props(styles.staleBadge).className}`}>
                <TriangleAlert
                  className={`icon ${stylex.props(styles.icon).className}`}
                  size={13}
                />{' '}
                {i18n('chartExpired')}
              </span>
            ) : (
              predictionUpdatedAt && (
                <span className={`prediction-age ${stylex.props(styles.predictionAge).className}`}>
                  {i18n('chartUpdated')}
                  <MarketTime value={predictionUpdatedAt} format="clock" includeZone />（
                  <TimeAgo since={predictionUpdatedAt} />）
                </span>
              )
            )}
          </div>
          <div
            className={`verdict-text ${stylex.props(styles.verdictText, verdictTone.text).className}`}
          >
            {i18n(DIRECTION_LABEL[p.direction] ?? 'chartNeutral')}
          </div>
          {p.anchor && (
            <div className={`verdict-reason ${stylex.props(styles.verdictReason).className}`}>
              {i18n('chartAnchor')}
              {tfLabel(p.anchor.timeframe, locale)} · <MarketTime value={p.anchor.time} /> · $
              {fmt(Number(p.anchor.price))}
            </div>
          )}
          {reassess &&
            conclusionOutdated(
              predictionUpdatedAt ?? p.anchor?.time,
              predictionStale,
              Date.now(),
            ) && <ReassessCta reassess={reassess} />}
        </div>
      ) : (
        <div className={`verdict ${stylex.props(styles.verdict, styles.verdictNeutral).className}`}>
          <div className={`verdict-label ${stylex.props(styles.verdictLabel).className}`}>
            {i18n('chartMode')}
          </div>
          <div
            className={`verdict-text ${stylex.props(styles.verdictText, styles.verdictTextNeutral).className}`}
          >
            {i18n('chartPreview')}
          </div>
          <div className={`verdict-reason ${stylex.props(styles.verdictReason).className}`}>
            {i18n('chartPreviewHelp')}
          </div>
        </div>
      )}
      {!p && emptyCta}

      {p && scenarios.length > 0 && (
        <>
          <SectionTitle>
            {i18n('chartScenarios')}
            {Math.abs(totalProb - 100) >= 1 && (
              <span className={`warn-red ${stylex.props(styles.warning).className}`}>
                {' '}
                <TriangleAlert
                  className={`icon ${stylex.props(styles.icon).className}`}
                  size={13}
                />{' '}
                {i18n('chartProbabilityTotal', { total: fmt(totalProb, 0) })}
              </span>
            )}
          </SectionTitle>
          {scenarios.map((sc, i) => (
            <div key={i} className={`zone-item ${stylex.props(styles.zoneItem).className}`}>
              <div className={`zone-head ${stylex.props(styles.zoneHead).className}`}>
                <span
                  className={`zone-label plain ${stylex.props(styles.zoneLabelPlain).className}`}
                >
                  {sc.label}
                </span>
                <span
                  className={`zone-range accent ${stylex.props(styles.zoneRangeAccent).className}`}
                >
                  {fmt(Number(sc.probability || 0), 0)}%
                </span>
              </div>
              <div
                className={`zone-meta md ${stylex.props(styles.zoneMeta, styles.zoneMetaMd).className}`}
              >
                {sc.path ?? ''}
                {sc.trigger ? i18n('chartTrigger', { trigger: sc.trigger }) : ''}
              </div>
            </div>
          ))}
        </>
      )}

      {p && rbp && (
        <>
          <SectionTitle>{i18n('chartRangePlan')}</SectionTitle>
          <div
            className={`zone-meta md ${stylex.props(styles.zoneMeta, styles.zoneMetaMd, styles.zoneMetaAfter).className}`}
          >
            {rbp.low != null && rbp.high != null && (
              <>
                {i18n('chartExpectedRange')}
                {fmt(Number(rbp.low))} – ${fmt(Number(rbp.high))}
                {rbp.condition ? ' · ' : ''}
              </>
            )}
            {rbp.condition ?? ''}
          </div>
          <div className={`grid2 ${stylex.props(styles.grid).className}`}>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>
              {i18n('chartIfLong')}
            </div>
            <div
              className={`v left ${stylex.props(styles.gridValue, styles.gridValueLeft).className}`}
            >
              {rbp.long_tactic ?? ''}
            </div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>
              {i18n('chartIfShort')}
            </div>
            <div
              className={`v left ${stylex.props(styles.gridValue, styles.gridValueLeft).className}`}
            >
              {rbp.short_tactic ?? ''}
            </div>
          </div>
        </>
      )}

      <SectionTitle>
        {i18n('chartEpsPe')}
        {p?.eps_pe_plan?.anchor_year ? ` · ${p.eps_pe_plan.anchor_year}` : ''}
      </SectionTitle>
      {(() => {
        const plan = p?.eps_pe_plan;
        if (!plan?.scenarios?.length) {
          return (
            <div className={`note-block ${stylex.props(styles.note).className}`}>
              {i18n('chartEpsPeEmpty')}
            </div>
          );
        }
        const current = s.last;
        return (
          <>
            {plan.scenarios.map((sc) => {
              const upside =
                sc.upside_pct != null && Number.isFinite(Number(sc.upside_pct))
                  ? Number(sc.upside_pct)
                  : current != null && Number(sc.target) > 0
                    ? (Number(sc.target) / Number(current) - 1) * 100
                    : null;
              return (
                <div
                  key={sc.kind}
                  className={`epspe-card ${stylex.props(styles.zoneItem).className}`}
                >
                  <div className={`epspe-head ${stylex.props(styles.verdictLabel).className}`}>
                    {i18n(
                      sc.kind === 'bull'
                        ? 'chartEpsPeBull'
                        : sc.kind === 'bear'
                          ? 'chartEpsPeBear'
                          : 'chartEpsPeBase',
                    )}
                  </div>
                  <div className={`epspe-target ${stylex.props(styles.zoneRangeAccent).className}`}>
                    ${fmt(Number(sc.target))}
                    {upside != null && (
                      <span
                        className={stylex.props(upside >= 0 ? styles.toneUp : styles.toneDown).className}
                      >
                        {' '}
                        {upside >= 0 ? '+' : ''}
                        {upside.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className={`grid2 ${stylex.props(styles.grid).className}`}>
                    <div className={`k ${stylex.props(styles.gridKey).className}`}>EPS</div>
                    <div className={`v ${stylex.props(styles.gridValue).className}`}>
                      ${fmt(Number(sc.eps))}
                    </div>
                    <div className={`k ${stylex.props(styles.gridKey).className}`}>PE</div>
                    <div className={`v ${stylex.props(styles.gridValue).className}`}>
                      {fmt(Number(sc.pe))}x
                    </div>
                    {sc.peg != null && (
                      <>
                        <div className={`k ${stylex.props(styles.gridKey).className}`}>PEG</div>
                        <div className={`v ${stylex.props(styles.gridValue).className}`}>
                          {fmt(Number(sc.peg))}
                        </div>
                      </>
                    )}
                  </div>
                  {sc.rationale && (
                    <div className={stylex.props(styles.zoneMeta).className}>{sc.rationale}</div>
                  )}
                </div>
              );
            })}
            {(plan.blended_target != null || plan.wall_street_target != null) && (
              <div className={`grid2 ${stylex.props(styles.grid).className}`}>
                {plan.blended_target != null && (
                  <>
                    <div className={`k ${stylex.props(styles.gridKey).className}`}>
                      {i18n('chartEpsPeBlended')}
                    </div>
                    <div className={`v ${stylex.props(styles.gridValue).className}`}>
                      ${fmt(Number(plan.blended_target))}
                    </div>
                  </>
                )}
                {plan.wall_street_target != null && (
                  <>
                    <div className={`k ${stylex.props(styles.gridKey).className}`}>
                      {i18n('chartEpsPeWallStreet')}
                    </div>
                    <div className={`v ${stylex.props(styles.gridValue).className}`}>
                      ${fmt(Number(plan.wall_street_target))}
                    </div>
                  </>
                )}
              </div>
            )}
            {plan.black_swan && (
              <div
                className={`note-block ${stylex.props(styles.note).className} ${stylex.props(styles.toneDown).className}`}
              >
                {i18n('chartEpsPeBlackSwan')} ${fmt(Number(plan.black_swan.target))}
                {plan.black_swan.triggers ? ` · ${plan.black_swan.triggers}` : ''}
              </div>
            )}
            {plan.digestion && plan.digestion.length > 0 && (
              <div className={`epspe-digest ${stylex.props(styles.zoneItem).className}`}>
                {plan.digestion.map((row) => (
                  <div
                    key={row.years}
                    className={stylex.props(styles.zoneHead).className}
                  >
                    <span className={stylex.props(styles.gridKey).className}>
                      {i18n('chartEpsPeDigestion', { years: String(row.years) })}
                    </span>
                    <span className={stylex.props(styles.gridValue).className}>
                      {fmt(Number(row.pe))}x
                    </span>
                  </div>
                ))}
              </div>
            )}
            {plan.bands && plan.bands.length > 0 && (
              <>
                <SectionTitle>{i18n('chartEpsPeBands')}</SectionTitle>
                {plan.bands.map((band) => (
                  <div
                    key={`${band.label}-${band.price}`}
                    className={`epspe-band ${stylex.props(styles.zoneItem).className}`}
                  >
                    <div className={stylex.props(styles.zoneHead).className}>
                      <span className={stylex.props(styles.zoneLabelPlain).className}>
                        {band.label}
                      </span>
                      <span className={stylex.props(styles.zoneRange).className}>
                        ${fmt(Number(band.price))}
                      </span>
                    </div>
                    {band.note && (
                      <div className={stylex.props(styles.zoneMeta).className}>{band.note}</div>
                    )}
                  </div>
                ))}
              </>
            )}
            {plan.sources && plan.sources.length > 0 && (
              <div className={`note-block ${stylex.props(styles.note).className}`}>
                <div>{i18n('chartEpsPeSources')}</div>
                {plan.sources.map((source) => (
                  <div key={source}>{source}</div>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {p && ep && (
        <>
          <SectionTitle>{i18n('chartEntryPlan')}</SectionTitle>
          {ep.entry_status_note && (
            <div
              className={`note-block ${stylex.props(styles.note).className}${ep.entry_status === 'invalidated' || ep.entry_status === 'stopped' ? ` ${stylex.props(styles.toneDown).className}` : ''}`}
            >
              {ep.entry_status_note}
            </div>
          )}
          <div
            className={`grid2 ${stylex.props(styles.grid, Boolean(ep.entry_status_note) && styles.gridAfterNote).className}`}
          >
            <div className={`k ${stylex.props(styles.gridKey).className}`}>
              {i18n('chartEntry')}
            </div>
            <div className={`v ${stylex.props(styles.gridValue).className}`}>${fmt(ep.entry)}</div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>{i18n('chartStop')}</div>
            <div className={`v ${stylex.props(styles.gridValue, styles.toneDown).className}`}>
              ${fmt(ep.stop)}
            </div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>
              {i18n('chartTarget1')}
              {signed(ep.target1_pct, 1)}%)
            </div>
            <div className={`v ${stylex.props(styles.gridValue, styles.toneUp).className}`}>
              ${fmt(ep.target1)}
            </div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>
              {i18n('chartTarget2')}
              {signed(ep.target2_pct, 1)}%)
            </div>
            <div className={`v ${stylex.props(styles.gridValue, styles.toneUp).className}`}>
              ${fmt(ep.target2)}
            </div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>R/R</div>
            <div
              className={`v ${stylex.props(styles.gridValue, rrTone(ep) === 'up' ? styles.toneUp : rrTone(ep) === 'down' ? styles.toneDown : null).className}`}
            >
              {fmt(ep.rr)} : 1
              {!ep.rr_ok && (
                <span className={`warn-red ${stylex.props(styles.warning).className}`}>
                  {' '}
                  <TriangleAlert
                    className={`icon ${stylex.props(styles.icon).className}`}
                    size={13}
                  />{' '}
                  &lt;2:1
                </span>
              )}
            </div>
          </div>
          {(ep.rationale || ep.stop_note) && (
            <div className={`plan-explain ${stylex.props(styles.planExplain).className}`}>
              {ep.rationale && (
                <>
                  <div
                    className={`section-subtitle ${stylex.props(styles.sectionSubtitle).className}`}
                  >
                    {i18n('chartEntryReason')}
                  </div>
                  <div
                    className={`note-block strong ${stylex.props(styles.note, styles.noteStrong).className}`}
                  >
                    {ep.rationale}
                  </div>
                </>
              )}
              {ep.stop_note && (
                <>
                  <div
                    className={`section-subtitle ${stylex.props(styles.sectionSubtitle).className}`}
                  >
                    {i18n('chartStopReason')}
                  </div>
                  <div className={`note-block ${stylex.props(styles.note).className}`}>
                    {ep.stop_note}
                  </div>
                </>
              )}
            </div>
          )}
          {targetContexts.length > 0 && (
            <>
              <div className={`section-subtitle ${stylex.props(styles.sectionSubtitle).className}`}>
                {i18n('chartTargetBasis')}
              </div>
              {targetContexts.map((target) => (
                <TargetContextCard key={target.key} target={target} />
              ))}
            </>
          )}
          {priceZones.length > 0 && (
            <>
              <div className={`section-subtitle ${stylex.props(styles.sectionSubtitle).className}`}>
                {i18n('chartZones')}
              </div>
              {priceZones.map((zone, i) => (
                <PriceZoneCard key={`${zone.kind}-${zone.label}-${i}`} zone={zone} compact />
              ))}
            </>
          )}
          {ep.note && (
            <div className={`note-block ${stylex.props(styles.note).className}`}>{ep.note}</div>
          )}
        </>
      )}

      {p && signals.length > 0 && (
        <>
          <SectionTitle>{i18n('chartAnnotations')}</SectionTitle>
          {signals.map((sig, i) => (
            <div
              key={i}
              className={`check-item signal ${stylex.props(styles.checkItem).className}`}
            >
              <div className={`check-icon ${stylex.props(styles.checkIcon).className}`}>
                {SIGNAL_ICON[sig.type ?? sig.kind ?? 'other'] ?? '•'}
              </div>
              <div>
                <div className={`check-label ${stylex.props(styles.checkLabel).className}`}>
                  {sig.label ?? ''}
                </div>
                <div className={`check-val ${stylex.props(styles.checkValue).className}`}>
                  {tfLabel(sig.timeframe, locale)}
                  {sig.price != null ? ` · $${fmt(sig.price)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {(() => {
        const tfData = tfDataOf(built, activeTf);
        const patterns123 = tfData?.pattern123 ?? [];
        const autoItems = [
          ...(tfData?.autoDivergence ?? []).map((d) => ({
            kindKey: `divergence-${d.kind}`,
            pair: d,
          })),
          ...(tfData?.autoBeichi ?? []).map((d) => ({ kindKey: `macdBeichi-${d.kind}`, pair: d })),
        ];
        if (!autoItems.length && !patterns123.length) return null;
        return (
          <>
            <SectionTitle>
              {i18n('chartAutoSignals')}
              {tfLabel(activeTf, locale)}
            </SectionTitle>
            {patterns123.map((pat, i) => (
              <Pattern123Item key={`p123-${i}`} pat={pat} />
            ))}
            {autoItems.map((it, i) => (
              <AutoSignalItem key={i} kindKey={it.kindKey} pair={it.pair} />
            ))}
            <div className={`note-block ${stylex.props(styles.note).className}`}>
              {i18n('chartAutoSignalsHelp')}
            </div>
          </>
        );
      })()}

      {!p && (
        <>
          <SectionTitle>{i18n('chartTechnicalSummary')}</SectionTitle>
          <div className={`grid2 ${stylex.props(styles.grid).className}`}>
            {analysisTfs.map((k) => {
              const t = techSummary(built, k);
              if (!t || t.last_dif === null) return null;
              return (
                <TechRow
                  key={k}
                  label={tfLabel(k, locale)}
                  value={`${fmt(t.last_dif)} / ${fmt(t.last_dea ?? 0)} / ${fmt(t.last_hist ?? 0)}`}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
