import { chineseTranslator, type Translator } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  TrainerClosedTrade,
  TrainerReveal,
  TrainerResult,
  TrainerView,
} from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { fmt } from '@web/lib/format';
import { Badge } from '@web/ui';
import { getPopoutBridge } from '../desktop/desktopWindowsBridge';
import { Button } from '../../ui/Button';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { formatPositionSize, formatRewardRisk } from './orderDraft';
import { unreachedBars } from './replayBands';
import {
  settlementSummary,
  settlementTradeRows,
  settlementTrack,
  trackGeometry,
  type SettlementTrack,
} from './settlementStats';

function TERMINATION_LABEL(
  tr: Translator = chineseTranslator,
): Record<TrainerResult['terminationReason'], string> {
  return {
    abstain: tr('trainTerminationAbstain'),
    no_decision: tr('trainTerminationNoDecision'),
    cancelled: tr('trainTerminationCancelled'),
    no_fill: tr('trainTerminationUnfilled'),
    stop: tr('trainTerminationStop'),
    target: tr('trainTerminationTarget'),
    manual: tr('trainTerminationManual'),
    horizon: tr('trainTerminationHorizon'),
    no_trade: tr('trainTerminationNoTrade'),
  };
}

function EXIT_REASON_LABEL(
  tr: Translator = chineseTranslator,
): Record<TrainerClosedTrade['exitReason'], string> {
  return {
    stop: tr('trainStop'),
    target: tr('trainTakeProfit'),
    manual: tr('trainManual'),
    horizon: tr('trainHorizon'),
  };
}

const styles = stylex.create({
  orderStatus: {
    color: colors.textSecondary,
  },
  orderError: {
    color: colors.down,
    fontSize: fontSizes.sm,
  },
  settleStage: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    gap: '14px',
    order: 1,
    padding: '14px 16px',
  },
  reveal: {
    alignItems: 'baseline',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '14px',
    paddingBottom: '12px',
  },
  revealKey: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  revealSym: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xl,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
  revealDate: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  revealJump: {
    'marginLeft': 'auto',
    ':not(:disabled)': {
      borderColor: colors.borderStrong,
      color: colors.accent,
    },
  },
  settleTail: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    gap: '10px',
    order: 3,
    padding: '12px 16px 14px',
  },
  settlementStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  leak: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  leakHead: {
    alignItems: 'baseline',
    display: 'flex',
    gap: '10px',
  },
  leakHeading: {
    fontSize: fontSizes.md,
    fontWeight: 600,
    margin: 0,
  },
  leakDescription: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontStyle: 'normal',
  },
  track: {
    backgroundColor: colors.backgroundElement,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    height: '46px',
    overflow: 'hidden',
    position: 'relative',
  },
  trackPlan: {
    backgroundImage: `repeating-linear-gradient(115deg, #191919 0 7px, ${colors.backgroundSurface} 7px 14px)`,
    inset: 0,
    position: 'absolute',
  },
  trackGot: {
    backgroundColor: colors.up,
    bottom: 0,
    left: 0,
    opacity: 0.85,
    position: 'absolute',
    top: 0,
  },
  trackGotLoss: {
    backgroundColor: colors.down,
  },
  trackGive: {
    backgroundColor: colors.down,
    bottom: 0,
    opacity: 0.28,
    position: 'absolute',
    top: 0,
  },
  trackZero: {
    backgroundColor: colors.accent,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: '2px',
  },
  trackCaption: {
    color: colors.textSecondary,
    left: '12px',
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  trackScale: {
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.xs,
    justifyContent: 'space-between',
  },
  trackScaleValue: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  figures: {
    backgroundColor: colors.border,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'grid',
    gap: '1px',
    gridTemplateColumns: 'repeat(3, 1fr)',
  },
  tradeTable: {
    borderCollapse: 'collapse',
    width: '100%',
  },
  tradeHeader: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: 500,
    letterSpacing: '0.05em',
    padding: '0 10px 7px',
    textAlign: 'left',
  },
  tradeCell: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    padding: '8px 10px',
  },
  tradeLastCell: {
    borderBottomWidth: 0,
  },
  tradeRight: {
    textAlign: 'right',
  },
  tradeNumeric: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  fillList: {
    display: 'grid',
    gap: '3px',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  fill: {
    alignItems: 'baseline',
    display: 'flex',
    gap: '6px',
  },
  fillPrice: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
    minWidth: '4.5em',
  },
  fillMuted: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  fillSize: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  tagStop: {
    color: colors.down,
  },
  settleFoot: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },
  epilogueToggle: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '6px',
  },
  epilogueInput: {
    accentColor: colors.accent,
  },
  settleHint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  ghostSlots: {
    display: 'flex',
    gap: '8px',
    marginLeft: 'auto',
  },
  ghostSlot: {
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'dashed',
    borderWidth: '1px',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    padding: '3px 9px',
  },
  reviewBar: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    color: colors.textSecondary,
    display: 'flex',
    flexWrap: 'wrap',
    flexShrink: 0,
    gap: '16px',
    padding: '10px 16px',
  },
  reviewSym: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
  reviewDate: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  reviewMetricValue: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  reviewCollapse: {
    marginLeft: 'auto',
  },
  figuresFigure: {
    backgroundColor: colors.backgroundSurface,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    margin: 0,
    padding: '12px 15px',
  },
  figuresCaption: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  figuresValue: {
    fontFamily: fonts.mono,
    fontSize: '26px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
  },
  figuresValueZero: {
    color: colors.textMuted,
  },
  figuresValueLoss: {
    color: colors.down,
  },
  figuresUnit: {
    color: colors.textMuted,
    fontSize: fontSizes.lg,
  },
  figuresSub: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  bandLegend: {
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.xs,
    gap: '12px',
  },
  bandSwatch: {
    display: 'inline-block',
    height: '8px',
    marginRight: '4px',
    verticalAlign: '-1px',
    width: '8px',
  },
  bandGiven: {
    backgroundColor: '#161616',
  },
  bandPlayed: {
    backgroundColor: '#14211f',
  },
  bandEpilogue: {
    backgroundColor: '#241a10',
  },
});

export interface TrainerSettlementProps {
  view: TrainerView;
  bridge: TrainerBridge;
  sessionId: string;
  expanded?: boolean;
  onCollapse?: () => void;
  onEpilogueBarsChange?: (bars: RawBar[] | null) => void;
}

export function TrainerSettlement({
  view,
  bridge,
  sessionId,
  expanded = false,
  onCollapse,
  onEpilogueBarsChange,
}: TrainerSettlementProps) {
  const { t: tr } = useLocale();
  const [reveal, setReveal] = useState<TrainerReveal | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  // On by default: the session is over, so there is nothing left to decide against and the point of
  // a post-mortem is to see what happened next. What the epilogue must never do is enter a
  // statistic — that isolation lives in settlementStats.ts, which never receives these bars.
  const [showEpilogue, setShowEpilogue] = useState(true);

  // Guarded on view.terminal even though this component is only ever mounted from the terminal
  // branch of TrainerChart — reveal() throwing before terminal is a rule this UI must never even
  // attempt to trigger, not just avoid exposing a button for.
  useEffect(() => {
    if (!view.terminal) return;
    let active = true;
    void bridge.reveal({ sessionId }).then((result) => {
      if (!active) return;
      if (result.ok) setReveal(result.data);
      else setRevealError(result.error);
    });
    return () => {
      active = false;
    };
  }, [bridge, sessionId, view.terminal]);

  useEffect(() => {
    onEpilogueBarsChange?.(showEpilogue && reveal ? reveal.epilogue : null);
  }, [showEpilogue, reveal, onEpilogueBarsChange]);

  const summary = settlementSummary(view.result);
  const rows = settlementTradeRows(view.trades);
  const track = settlementTrack(view.trades);
  const missed = unreachedBars(view);
  const sourceSymbol = reveal?.provenance.sourceSymbol ?? null;
  const sourceDate = reveal?.provenance.sourceCutoff.slice(0, 10) ?? null;

  if (expanded) {
    return (
      <div className={`trainer-review-bar ${stylex.props(styles.reviewBar).className}`}>
        <span className={`num trainer-review-sym ${stylex.props(styles.reviewSym).className}`}>
          {sourceSymbol ?? view.symbol}
        </span>
        {sourceDate && (
          <span className={`num trainer-review-date ${stylex.props(styles.reviewDate).className}`}>
            {sourceDate}
          </span>
        )}
        {track && (
          <>
            <span>
              {tr('trainActual')}{' '}
              <span className={`num ${stylex.props(styles.reviewMetricValue).className}`}>
                {fmt(track.gotR)}
              </span>{' '}
              R
            </span>
            <span>
              {tr('trainPlanned')}{' '}
              <span className={`num ${stylex.props(styles.reviewMetricValue).className}`}>
                {formatRewardRisk(track.plannedR)}
              </span>{' '}
              R
            </span>
          </>
        )}
        <TrainerBandLegend />
        <EpilogueToggle checked={showEpilogue} disabled={!reveal} onChange={setShowEpilogue} />
        <Button
          className={`trainer-review-collapse ${stylex.props(styles.reviewCollapse).className}`}
          onClick={onCollapse}
        >
          {tr('trainCollapse')}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className={`trainer-settle-stage ${stylex.props(styles.settleStage).className}`}>
        <div className={`trainer-reveal ${stylex.props(styles.reveal).className}`}>
          <span className={`trainer-reveal-key ${stylex.props(styles.revealKey).className}`}>
            {tr('trainIdentity')}
          </span>
          {sourceSymbol ? (
            <>
              <span
                className={`num trainer-reveal-sym ${stylex.props(styles.revealSym).className}`}
              >
                {sourceSymbol}
              </span>
              <span
                className={`num trainer-reveal-date ${stylex.props(styles.revealDate).className}`}
              >
                {sourceDate}
              </span>
              <OpenRealChartButton symbol={sourceSymbol} />
            </>
          ) : revealError ? (
            <span className={`trainer-order-error ${stylex.props(styles.orderError).className}`}>
              {revealError}
            </span>
          ) : (
            <span
              className={`trainer-order-panel--status ${stylex.props(styles.orderStatus).className}`}
            >
              {tr('trainRevealing')}
            </span>
          )}
        </div>

        <div
          className={`trainer-settlement-stats ${stylex.props(styles.settlementStats).className}`}
          data-testid="trainer-settlement-stats"
        >
          {track ? (
            <>
              <PlanTrack track={track} summary={summary} />
              <TrainerFigures track={track} summary={summary} />
            </>
          ) : (
            <div
              className={`trainer-order-panel--status ${stylex.props(styles.orderStatus).className}`}
            >
              {summary ? TERMINATION_LABEL(tr)[summary.terminationReason] : tr('trainNoFills')}
            </div>
          )}
        </div>
      </div>

      <div className={`trainer-settle-tail ${stylex.props(styles.settleTail).className}`}>
        {rows.length > 0 && (
          <table
            className={`trainer-trade-table ${stylex.props(styles.tradeTable).className}`}
            data-testid="trainer-settlement-trades"
          >
            <thead>
              <tr>
                <th className={stylex.props(styles.tradeHeader).className}>
                  {tr('trainDirection')}
                </th>
                <th className={stylex.props(styles.tradeHeader).className}>{tr('trainEntry')}</th>
                <th className={stylex.props(styles.tradeHeader).className}>
                  {tr('trainExitLabel')}
                </th>
                <th
                  className={`r ${stylex.props(styles.tradeHeader, styles.tradeRight).className}`}
                >
                  {tr('trainPlannedRr')}
                </th>
                <th
                  className={`r ${stylex.props(styles.tradeHeader, styles.tradeRight).className}`}
                >
                  {tr('trainRealizedR')}
                </th>
                <th
                  className={`r ${stylex.props(styles.tradeHeader, styles.tradeRight).className}`}
                >
                  {tr('trainGiveback')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.tradeId}>
                  <td
                    className={
                      stylex.props(
                        styles.tradeCell,
                        rowIndex === rows.length - 1 && styles.tradeLastCell,
                      ).className
                    }
                  >
                    <Badge tone="muted">
                      {row.direction === 'long' ? tr('trainLongShort') : tr('trainShortShort')}
                    </Badge>
                  </td>
                  <td
                    className={
                      stylex.props(
                        styles.tradeCell,
                        rowIndex === rows.length - 1 && styles.tradeLastCell,
                      ).className
                    }
                  >
                    <ul className={`trainer-fill-list ${stylex.props(styles.fillList).className}`}>
                      {row.entries.map((fill, index) => (
                        <FillLine
                          key={index}
                          price={fill.price}
                          size={fill.size}
                          label={index === 0 ? tr('trainInitialEntry') : tr('trainAdd')}
                        />
                      ))}
                    </ul>
                  </td>
                  <td
                    className={
                      stylex.props(
                        styles.tradeCell,
                        rowIndex === rows.length - 1 && styles.tradeLastCell,
                      ).className
                    }
                  >
                    <ul className={`trainer-fill-list ${stylex.props(styles.fillList).className}`}>
                      {row.exits.map((fill, index) => (
                        <FillLine
                          key={index}
                          price={fill.price}
                          size={fill.size}
                          label={EXIT_REASON_LABEL(tr)[fill.reason]}
                          stop={fill.reason === 'stop'}
                        />
                      ))}
                    </ul>
                  </td>
                  <td
                    className={`r num ${
                      stylex.props(
                        styles.tradeCell,
                        styles.tradeRight,
                        styles.tradeNumeric,
                        rowIndex === rows.length - 1 && styles.tradeLastCell,
                      ).className
                    }`}
                  >
                    {row.plannedRewardRisk === null
                      ? '—'
                      : `${formatRewardRisk(row.plannedRewardRisk)} : 1`}
                  </td>
                  <td
                    className={`r num ${
                      stylex.props(
                        styles.tradeCell,
                        styles.tradeRight,
                        styles.tradeNumeric,
                        rowIndex === rows.length - 1 && styles.tradeLastCell,
                      ).className
                    }`}
                  >
                    {fmt(row.netR)}
                  </td>
                  <td
                    className={`r num ${
                      stylex.props(
                        styles.tradeCell,
                        styles.tradeRight,
                        styles.tradeNumeric,
                        rowIndex === rows.length - 1 && styles.tradeLastCell,
                      ).className
                    }`}
                  >
                    {fmt(row.mfeGivebackR)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className={`trainer-settle-foot ${stylex.props(styles.settleFoot).className}`}>
          <EpilogueToggle
            checked={showEpilogue}
            disabled={!reveal}
            onChange={setShowEpilogue}
            hint
          />
          {missed > 0 && (
            <span className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
              {tr('trainEndedEarly')}
              {missed}
              {tr('trainUnseenSuffix')}
            </span>
          )}
          <div className={`trainer-ghost-slots ${stylex.props(styles.ghostSlots).className}`}>
            <span className={stylex.props(styles.ghostSlot).className}>
              {tr('trainReviewTabHelp')}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function EpilogueToggle({
  checked,
  disabled,
  onChange,
  hint = false,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  hint?: boolean;
}) {
  const { t: tr } = useLocale();
  return (
    <label
      className={`trainer-settlement-epilogue-toggle ${stylex.props(styles.epilogueToggle).className}`}
    >
      <input
        type="checkbox"
        className={stylex.props(styles.epilogueInput).className}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {tr('trainShowEpilogue')}
      {hint && (
        <span className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
          {tr('trainEpilogueHelp')}
        </span>
      )}
    </label>
  );
}

function FillLine({
  price,
  size,
  label,
  stop = false,
}: {
  price: number;
  size: number;
  label: string;
  stop?: boolean;
}) {
  return (
    <li className={`trainer-fill ${stylex.props(styles.fill).className}`}>
      <span className={`num trainer-fill-price ${stylex.props(styles.fillPrice).className}`}>
        {fmt(price)}
      </span>
      <span
        className={`trainer-fill-tag ${stylex.props(styles.fillMuted, stop && styles.tagStop).className}`}
      >
        {label}
      </span>
      <span
        className={`num trainer-fill-size ${stylex.props(styles.fillMuted, styles.fillSize).className}`}
      >
        {formatPositionSize(size)}
      </span>
    </li>
  );
}

function OpenRealChartButton({ symbol }: { symbol: string }) {
  const { t: tr } = useLocale();
  const bridge = getPopoutBridge();
  if (!bridge) return null;
  return (
    <Button
      className={`trainer-reveal-jump ${stylex.props(styles.revealJump).className}`}
      onClick={() => void bridge.openPopout(symbol)}
    >
      {tr('trainOpenRealChart')}
    </Button>
  );
}

interface TrackProps {
  track: SettlementTrack;
  summary: ReturnType<typeof settlementSummary>;
}

function PlanTrack({ track, summary }: TrackProps) {
  const { t: tr } = useLocale();
  const geom = trackGeometry(track);
  const caption = trackCaption(track, summary, tr);
  return (
    <div className={`trainer-leak ${stylex.props(styles.leak).className}`}>
      <div className={`trainer-leak-head ${stylex.props(styles.leakHead).className}`}>
        <h2 className={stylex.props(styles.leakHeading).className}>{tr('trainPlannedVsActual')}</h2>
        <em className={stylex.props(styles.leakDescription).className}>{tr('trainTrackHelp')}</em>
      </div>
      <div className={`trainer-track ${stylex.props(styles.track).className}`}>
        <div className={`trainer-track-plan ${stylex.props(styles.trackPlan).className}`} />
        <div
          className={`trainer-track-got${geom.gotNegative ? ' trainer-track-got--loss' : ''} ${stylex.props(styles.trackGot, geom.gotNegative && styles.trackGotLoss).className}`}
          style={{ width: `${geom.gotPct}%` }}
        />
        <div
          className={`trainer-track-give ${stylex.props(styles.trackGive).className}`}
          style={{ left: `${geom.giveLeftPct}%`, width: `${geom.givePct}%` }}
        />
        <div className={`trainer-track-zero ${stylex.props(styles.trackZero).className}`} />
        <div className={`trainer-track-caption ${stylex.props(styles.trackCaption).className}`}>
          {caption}
        </div>
      </div>
      <div className={`trainer-track-scale ${stylex.props(styles.trackScale).className}`}>
        <span className={`num ${stylex.props(styles.trackScaleValue).className}`}>0R</span>
        <span className={`num ${stylex.props(styles.trackScaleValue).className}`}>
          {tr('trainPlanLimit')}
          {formatRewardRisk(track.plannedR)}R
        </span>
      </div>
    </div>
  );
}

function trackCaption(
  track: SettlementTrack,
  summary: TrackProps['summary'],
  tr: Translator = chineseTranslator,
): string {
  const ending = summary ? TERMINATION_LABEL(tr)[summary.terminationReason] : tr('trainEnded');
  const plan = tr('trainPlanSpace', { value1: formatRewardRisk(track.plannedR) });
  if (track.gotR < 0)
    return tr('trainPlanLost', { value1: plan, value2: fmt(Math.abs(track.gotR)), value3: ending });
  if (track.gotR === 0) return tr('trainPlanZero', { value1: plan, value2: ending });
  if (track.givebackR > 0) {
    return tr('trainPlanGiveback', {
      value1: plan,
      value2: fmt(track.gotR),
      value3: fmt(track.givebackR),
      value4: ending,
    });
  }
  return tr('trainPlanRealized', { value1: plan, value2: fmt(track.gotR), value3: ending });
}

function TrainerFigures({ track, summary }: TrackProps) {
  const { t: tr } = useLocale();
  const single = track.tradeCount === 1;
  const perTrade = single ? track.plannedR : track.plannedR / track.tradeCount;
  return (
    <div className={`trainer-figures ${stylex.props(styles.figures).className}`}>
      <figure className={`trainer-fig ${stylex.props(styles.figuresFigure).className}`}>
        <figcaption className={stylex.props(styles.figuresCaption).className}>
          {tr('trainPlannedRr')}
        </figcaption>
        <div className={`num trainer-fig-val ${stylex.props(styles.figuresValue).className}`}>
          {formatRewardRisk(perTrade)}
          <span className={`trainer-fig-unit ${stylex.props(styles.figuresUnit).className}`}>
            {' '}
            : 1
          </span>
        </div>
        <div className={`trainer-fig-sub ${stylex.props(styles.figuresSub).className}`}>
          {single
            ? tr('trainBasedOnFirstFill')
            : tr('trainAverageTrades', {
                value1: track.tradeCount,
                value2: formatRewardRisk(track.plannedR),
              })}
        </div>
      </figure>
      <figure className={`trainer-fig ${stylex.props(styles.figuresFigure).className}`}>
        <figcaption className={stylex.props(styles.figuresCaption).className}>
          {tr('trainActual')}
        </figcaption>
        <div
          className={`num trainer-fig-val ${
            stylex.props(
              styles.figuresValue,
              track.gotR === 0 && styles.figuresValueZero,
              track.gotR < 0 && styles.figuresValueLoss,
            ).className
          }${track.gotR < 0 ? ' down' : ''}`}
        >
          {fmt(track.gotR)}
          <span className={`trainer-fig-unit ${stylex.props(styles.figuresUnit).className}`}>
            {' '}
            R
          </span>
        </div>
        <div className={`trainer-fig-sub ${stylex.props(styles.figuresSub).className}`}>
          {summary
            ? tr('trainWinLossCounts', {
                value1: TERMINATION_LABEL(tr)[summary.terminationReason],
                value2: summary.winCount,
                value3: summary.lossCount,
              })
            : ''}
        </div>
      </figure>
      <figure className={`trainer-fig ${stylex.props(styles.figuresFigure).className}`}>
        <figcaption className={stylex.props(styles.figuresCaption).className}>
          {tr('trainGiveback')}
        </figcaption>
        <div
          className={`num trainer-fig-val ${
            stylex.props(styles.figuresValue, track.givebackR === 0 && styles.figuresValueZero)
              .className
          }`}
        >
          {fmt(track.givebackR)}
          <span className={`trainer-fig-unit ${stylex.props(styles.figuresUnit).className}`}>
            {' '}
            R
          </span>
        </div>
        <div className={`trainer-fig-sub ${stylex.props(styles.figuresSub).className}`}>
          {track.givebackR === 0 ? tr('trainNoGiveback') : tr('trainGivebackHelp')}
        </div>
      </figure>
    </div>
  );
}

export function TrainerBandLegend() {
  const { t: tr } = useLocale();
  return (
    <div className={`trainer-band-legend ${stylex.props(styles.bandLegend).className}`}>
      <span>
        <i
          className={`trainer-band-swatch trainer-band-swatch--given ${
            stylex.props(styles.bandSwatch, styles.bandGiven).className
          }`}
        />
        {tr('trainInitialHistory')}
      </span>
      <span>
        <i
          className={`trainer-band-swatch trainer-band-swatch--played ${
            stylex.props(styles.bandSwatch, styles.bandPlayed).className
          }`}
        />
        {tr('trainPlayedShort')}
      </span>
      <span>
        <i
          className={`trainer-band-swatch trainer-band-swatch--epilogue ${
            stylex.props(styles.bandSwatch, styles.bandEpilogue).className
          }`}
        />
        {tr('trainEpilogue')}
      </span>
    </div>
  );
}
