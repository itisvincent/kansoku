import { useLocale } from '@web/lib/i18n';
import { analysisLabel, detectorText, sepaVerdictReason } from '../analysisLabels';
import * as stylex from '@stylexjs/stylex';
import { Check, TriangleAlert, X } from 'lucide-react';
import type { SepaBuilt } from '@kansoku/shared/types';
import { fmt, signed } from '@web/lib/format';
import { colors, fontSizes } from '../../../theme/tokens.stylex';
import { NewsSection } from '../NewsSection';
import { Badge, Num, SectionTitle } from '@web/ui';

const styles = stylex.create({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.backgroundSurface,
    fontSize: fontSizes.md,
    overflow: 'hidden',
  },
  scroll: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px',
  },
  header: {
    marginBottom: '14px',
    paddingBottom: '12px',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  symbol: {
    fontSize: fontSizes.xl,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  name: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    marginTop: '2px',
  },
  price: {
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginTop: '8px',
    color: colors.textPrimary,
  },
  priceChange: {
    fontSize: fontSizes.md,
    marginLeft: '8px',
  },
  priceUp: {
    color: colors.up,
  },
  priceDown: {
    color: colors.down,
  },
  priceDate: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: '2px',
  },
  verdict: (color: string) => ({
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${color} 14%, transparent), color-mix(in srgb, ${color} 4%, transparent))`,
    borderColor: color,
    borderStyle: 'solid',
    borderWidth: '1px',
    padding: '12px',
    marginBottom: '14px',
  }),
  verdictLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  verdictText: (color: string) => ({
    fontSize: fontSizes.xl,
    fontWeight: 600,
    color,
    marginTop: '4px',
  }),
  verdictReason: {
    fontSize: fontSizes.base,
    color: colors.textPrimary,
    marginTop: '6px',
    lineHeight: 1.5,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '6px 10px',
    fontSize: fontSizes.base,
  },
  key: {
    color: colors.textSecondary,
  },
  value: {
    color: colors.textPrimary,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  valueLeft: {
    textAlign: 'left',
  },
  valueUp: {
    color: colors.up,
  },
  valueDown: {
    color: colors.down,
  },
  checkItem: {
    display: 'flex',
    gap: '10px',
    padding: '7px 8px',
    marginBottom: '4px',
    backgroundColor: colors.backgroundSurface,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
  },
  checkPass: {
    borderLeftColor: colors.up,
  },
  checkFail: {
    borderLeftColor: colors.down,
  },
  checkUnknown: {
    borderLeftColor: colors.textMuted,
  },
  checkIcon: {
    display: 'flex',
    alignItems: 'center',
    fontSize: fontSizes.md,
  },
  icon: {
    verticalAlign: '-2px',
  },
  checkIconUp: {
    color: colors.up,
  },
  checkIconDown: {
    color: colors.down,
  },
  checkIconUnknown: {
    color: colors.textPrimary,
  },
  checkLabel: {
    fontSize: fontSizes.base,
    color: colors.textPrimary,
    fontWeight: 500,
  },
  checkVal: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: '2px',
  },
  zone: (color: string) => ({
    display: 'block',
    padding: '8px 10px',
    marginBottom: '6px',
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: color,
    borderLeftStyle: 'solid',
    borderLeftWidth: '3px',
  }),
  zoneHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  zoneLabel: (color: string) => ({
    fontSize: fontSizes.base,
    fontWeight: 600,
    color,
  }),
  zoneRange: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  zoneMeta: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: '3px',
    lineHeight: 1.45,
  },
  zoneSourcesInline: {
    color: colors.textMuted,
  },
  noteBlock: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: '6px',
    lineHeight: 1.4,
  },
  ruleBlock: {
    borderLeftColor: colors.border,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 1.5,
    marginTop: '8px',
    paddingLeft: '8px',
  },
  hypoBadge: {
    marginLeft: '6px',
  },
  warnRed: {
    color: colors.down,
  },
  disclaimer: {
    marginTop: '16px',
    paddingTop: '10px',
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
});

const CHECK_ICON: Record<string, { icon: typeof Check; tone: string }> = {
  pass: { icon: Check, tone: 'up' },
  fail: { icon: X, tone: 'down' },
  unknown: { icon: TriangleAlert, tone: '' },
};

function rrTone(ep: { rr_great: boolean; rr_ok: boolean }): string {
  if (ep.rr_great) return 'up';
  return ep.rr_ok ? '' : 'down';
}

export function SepaSidebar({ built }: { built: SepaBuilt }) {
  const { t: i18n, locale } = useLocale();
  const s = built.sidebar;
  const ep = built.chart.entryPlan;
  const zones = built.chart.supportZones;
  const kv = s.keyValues;

  return (
    <div className={`sidebar ${stylex.props(styles.sidebar).className}`}>
      <div className={`sidebar-scroll ${stylex.props(styles.scroll).className}`}>
        <div className={`header ${stylex.props(styles.header).className}`}>
          <div className={`symbol ${stylex.props(styles.symbol).className}`}>{s.symbol}</div>
          <div className={`name ${stylex.props(styles.name).className}`}>{s.name}</div>
          <div className={`price ${stylex.props(styles.price).className}`}>
            ${fmt(s.last)}
            <span
              className={`price-change ${stylex.props(styles.priceChange, s.chgPct >= 0 ? styles.priceUp : styles.priceDown).className}`}
            >
              {signed(s.chgPct)}%
            </span>
          </div>
          <div className={`price-date ${stylex.props(styles.priceDate).className}`}>
            {s.asOf}
            {i18n('chartProvider')}
          </div>
        </div>

        <div
          className={`verdict ${stylex.props(styles.verdict(s.verdict.color)).className}`}
          style={stylex.props(styles.verdict(s.verdict.color)).style}
        >
          <div className={`verdict-label ${stylex.props(styles.verdictLabel).className}`}>
            {i18n('sepaConclusion')}
          </div>
          <div
            className={`verdict-text ${stylex.props(styles.verdictText(s.verdict.color)).className}`}
            style={stylex.props(styles.verdictText(s.verdict.color)).style}
          >
            {s.verdict.label}
          </div>
          <div className={`verdict-reason ${stylex.props(styles.verdictReason).className}`}>
            {sepaVerdictReason(s.verdict.reason, locale)}
          </div>
        </div>

        {s.stage.length > 0 && (
          <>
            <SectionTitle>{i18n('sepaStage')}</SectionTitle>
            <div className={`grid2 ${stylex.props(styles.grid2).className}`}>
              {s.stage.map((row) => (
                <StageRow key={row.k} k={analysisLabel(row.k, locale)} v={row.v} />
              ))}
            </div>
          </>
        )}

        <SectionTitle>{i18n('sepaTrendTemplate')}</SectionTitle>
        {s.checks.map((c) => {
          const status = CHECK_ICON[c.status] ?? CHECK_ICON.unknown;
          const StatusIcon = status.icon;
          return (
            <div
              key={c.label}
              className={`check-item ${c.status} ${stylex.props(styles.checkItem, c.status === 'pass' ? styles.checkPass : c.status === 'fail' ? styles.checkFail : styles.checkUnknown).className}`}
            >
              <div
                className={`check-icon ${stylex.props(styles.checkIcon, status.tone === 'up' ? styles.checkIconUp : status.tone === 'down' ? styles.checkIconDown : styles.checkIconUnknown).className}`}
              >
                <StatusIcon className={stylex.props(styles.icon).className} size={14} />
              </div>
              <div>
                <div className={`check-label ${stylex.props(styles.checkLabel).className}`}>
                  {analysisLabel(c.label, locale)}
                </div>
                <div className={`check-val ${stylex.props(styles.checkVal).className}`}>
                  {detectorText(c.val, locale)}
                </div>
              </div>
            </div>
          );
        })}

        <SectionTitle>{i18n('sepaKeyValues')}</SectionTitle>
        <div className={`grid2 ${stylex.props(styles.grid2).className}`}>
          <div className={`k ${stylex.props(styles.key).className}`}>
            {i18n('sepa52HighDistance')}
            {fmt(kv.high52w)}
          </div>
          <div className={`v ${stylex.props(styles.value, styles.valueDown).className}`}>
            {signed(kv.h52Pct)}%
          </div>
          <div className={`k ${stylex.props(styles.key).className}`}>
            {i18n('sepa52LowDistance')}
            {fmt(kv.low52w)}
          </div>
          <div className={`v ${stylex.props(styles.value, styles.valueUp).className}`}>
            {signed(kv.l52Pct, 0)}%
          </div>
          <div className={`k ${stylex.props(styles.key).className}`}>
            {i18n('sepaMa50Distance')}
          </div>
          <div className={`v ${stylex.props(styles.value).className}`}>
            <Num value={kv.ma50Pct} diff suffix="%" />
          </div>
          <div className={`k ${stylex.props(styles.key).className}`}>
            {i18n('sepaMa200Distance')}
          </div>
          <div className={`v ${stylex.props(styles.value).className}`}>
            <Num value={kv.ma200Pct} diff suffix="%" />
          </div>
          {kv.rs21d !== null && (
            <>
              <div className={`k ${stylex.props(styles.key).className}`}>RS 21d (vs SPY)</div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                <Num value={kv.rs21d} diff digits={1} suffix=" pp" />
              </div>
            </>
          )}
          {kv.rs126d !== null && (
            <>
              <div className={`k ${stylex.props(styles.key).className}`}>RS 126d (vs SPY)</div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                <Num value={kv.rs126d} diff digits={1} suffix=" pp" />
              </div>
            </>
          )}
        </div>

        {zones.length > 0 && (
          <>
            <SectionTitle>{i18n('sepaSupport')}</SectionTitle>
            {zones.map((z, i) => (
              <div
                key={i}
                className={`zone-item ${stylex.props(styles.zone(z.axis_color)).className}`}
                style={stylex.props(styles.zone(z.axis_color)).style}
              >
                <div className={`zone-head ${stylex.props(styles.zoneHead).className}`}>
                  <span
                    className={`zone-label ${stylex.props(styles.zoneLabel(z.axis_color)).className}`}
                    style={stylex.props(styles.zoneLabel(z.axis_color)).style}
                  >
                    {analysisLabel(z.label, locale)}
                  </span>
                  <span className={`zone-range ${stylex.props(styles.zoneRange).className}`}>
                    ${fmt(z.low)} – ${fmt(z.high)} (
                    {signed(((z.high + z.low) / 2 / s.last) * 100 - 100, 1)}%)
                  </span>
                </div>
                <div className={`zone-meta ${stylex.props(styles.zoneMeta).className}`}>
                  {analysisLabel(z.note, locale)}
                  {z.sources.length > 0 && (
                    <span
                      className={`zone-sources-inline ${stylex.props(styles.zoneSourcesInline).className}`}
                    >
                      {' · '}
                      {z.sources.map((source) => analysisLabel(source, locale)).join(' / ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {ep && (
          <>
            <SectionTitle>
              {i18n('chartEntryPlan')}
              {ep.hypothetical && (
                <Badge className={`hypo-badge ${stylex.props(styles.hypoBadge).className}`}>
                  {i18n('sepaHypothetical')}
                </Badge>
              )}
            </SectionTitle>
            <div className={`grid2 ${stylex.props(styles.grid2).className}`}>
              <div className={`k ${stylex.props(styles.key).className}`}>
                {i18n('sepaBuyRange')}
              </div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                ${fmt(ep.pivot)} – ${fmt(ep.buy_zone_high)}
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>{i18n('chartStop')}</div>
              <div className={`v ${stylex.props(styles.value, styles.valueDown).className}`}>
                ${fmt(ep.stop)} ({signed(ep.stop_pct, 1)}%)
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>
                {i18n('sepaTarget1')}
                {fmt(ep.target1_pct, 0)}%)
              </div>
              <div className={`v ${stylex.props(styles.value, styles.valueUp).className}`}>
                ${fmt(ep.target1)}
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>
                {i18n('sepaTarget2')}
                {fmt(ep.target2_pct, 0)}%)
              </div>
              <div className={`v ${stylex.props(styles.value, styles.valueUp).className}`}>
                ${fmt(ep.target2)}
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>{i18n('sepaRr')}</div>
              <div
                className={`v ${stylex.props(styles.value, rrTone(ep) === 'up' ? styles.valueUp : rrTone(ep) === 'down' ? styles.valueDown : null).className}`}
              >
                {fmt(ep.rr)} : 1
                {!ep.rr_ok && (
                  <span className={`warn-red ${stylex.props(styles.warnRed).className}`}>
                    {' '}
                    <TriangleAlert className={stylex.props(styles.icon).className} size={13} />
                    {i18n('sepaNoEntry')}
                  </span>
                )}
              </div>
            </div>
            {ep.note && (
              <div className={`note-block ${stylex.props(styles.noteBlock).className}`}>
                {ep.note}
              </div>
            )}
            <div className={`rule-block ${stylex.props(styles.ruleBlock).className}`}>
              <b>{i18n('sepaStopStages')}</b>
              <br />
              {i18n('sepaStop1')}
              <br />
              {i18n('sepaStop2')}
              <br />
              {i18n('sepaStop3')}
            </div>
          </>
        )}

        {s.position && (
          <>
            <SectionTitle>{i18n('chartPositionView')}</SectionTitle>
            <div className={`grid2 ${stylex.props(styles.grid2).className}`}>
              <div className={`k ${stylex.props(styles.key).className}`}>
                {i18n('chartPosition')}
              </div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                {s.position.shares} sh
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>{i18n('chartCost')}</div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                ${fmt(s.position.cost)}
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>
                {i18n(s.position.unrealized >= 0 ? 'chartUnrealizedGain' : 'chartUnrealizedLoss')}
              </div>
              <div
                className={`v ${stylex.props(styles.value, s.position.unrealized >= 0 ? styles.valueUp : styles.valueDown).className}`}
              >
                {signed(s.position.unrealized)} ({signed(s.position.unrealizedPct)}%)
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>
                {i18n('sepaHoldBoundary')}
              </div>
              <div className={`v ${stylex.props(styles.value).className}`}>${fmt(s.ma50Now)}</div>
            </div>
          </>
        )}

        <NewsSection news={s.news ?? []} />

        <div className={`disclaimer ${stylex.props(styles.disclaimer).className}`}>
          <TriangleAlert className={stylex.props(styles.icon).className} size={12} />{' '}
          {i18n('chartDisclaimer')}
          <br />
          {i18n('sepaMethodNote')}
        </div>
      </div>
    </div>
  );
}

function StageRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className={`k ${stylex.props(styles.key).className}`}>{k}</div>
      <div className={`v left ${stylex.props(styles.value, styles.valueLeft).className}`}>{v}</div>
    </>
  );
}
