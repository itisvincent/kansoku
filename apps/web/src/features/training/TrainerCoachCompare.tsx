import { useLocale } from '@web/lib/i18n';
import { useState } from 'react';
import type {
  TrainerAnnotationVerdict,
  TrainerCoachAgreement,
  TrainerCoachCall,
  TrainerCoachOutcome,
} from '@kansoku/pro-api';
import { fmt, signed } from '@web/lib/format';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, fonts, radii, sizes } from '../../theme/tokens.stylex';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { coachBarLabel, coachPlanLine, DIRECTION_LABEL } from './coachStance';

const ANNOTATION_ORDER: TrainerAnnotationVerdict[] = [
  'sound',
  'right_call_wrong_reason',
  'unfounded',
  'skipped',
];

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  card: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    padding: '10px 12px',
  },
  head: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: fontSizes.sm,
    gap: '10px',
  },
  chip: {
    alignItems: 'center',
    backgroundColor: 'rgb(20 20 20 / 0.88)',
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textPrimary,
    display: 'flex',
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    gap: '8px',
    padding: '3px 9px',
    pointerEvents: 'auto',
  },
  at: {
    cursor: 'pointer',
    font: 'inherit',
  },
  body: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    margin: 0,
  },
  num: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  error: {
    color: colors.down,
    fontSize: fontSizes.sm,
  },
  button: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'boxSizing': 'border-box',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.base,
    'gap': '7px',
    'height': sizes.controlHeight,
    'padding': '0 14px',
    ':hover:not(:disabled)': {
      borderColor: colors.accent,
    },
    ':focus-visible': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      outline: 'none',
    },
  },
  accent: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  disabled: {
    borderColor: colors.borderStrong,
    color: colors.textMuted,
    cursor: 'default',
  },
  annotate: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopStyle: 'dashed',
    borderTopWidth: '1px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    paddingTop: '8px',
  },
  persuaded: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  hit: {
    borderColor: colors.up,
    color: colors.up,
  },
  miss: {
    borderColor: colors.down,
    color: colors.down,
  },
});

export interface TrainerCoachCompareProps {
  calls: readonly TrainerCoachCall[];
  bridge: TrainerBridge;
  sessionId: string;
  onAnnotated: (call: TrainerCoachCall) => void;
  onSeek: (coachId: string) => void;
}

/**
 * Sits directly under the chart: each call happened at a specific bar, and the closer the
 * comparison is to that bar the less work it takes to read the two together.
 */
export function TrainerCoachCompare({
  calls,
  bridge,
  sessionId,
  onAnnotated,
  onSeek,
}: TrainerCoachCompareProps) {
  const { t: tr } = useLocale();
  const ANNOTATION_LABEL: Record<TrainerAnnotationVerdict, string> = {
    sound: tr('trainSound'),
    right_call_wrong_reason: tr('trainRightWrongReason'),
    unfounded: tr('trainUnsound'),
    skipped: tr('trainSkip'),
  };

  const AGREEMENT_LABEL: Record<TrainerCoachAgreement, string> = {
    aligned: tr('trainSameDirection'),
    persuaded: tr('trainPersuaded'),
    held: tr('trainHeldView'),
  };

  const OUTCOME_LABEL: Record<TrainerCoachOutcome, string> = {
    win: tr('trainTargetReached'),
    loss: tr('trainStopped'),
    timeout_flat: tr('trainNoResult'),
    no_fill: tr('trainNotFilled'),
    format_violation: tr('trainInvalidPrices'),
    abstained: tr('trainCoachWait'),
  };

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const annotate = async (coachId: string, verdict: TrainerAnnotationVerdict): Promise<void> => {
    setPending(coachId);
    setError(null);
    try {
      const result = await bridge.annotate({ sessionId, coachId, verdict });
      if (result.ok) onAnnotated(result.data);
      else setError(result.error);
    } finally {
      setPending(null);
    }
  };

  if (calls.length === 0) {
    return (
      <div
        className={`trainer-review-coach ${stylex.props(styles.root).className}`}
        data-testid="trainer-coach-compare"
      >
        <div className={`trainer-label ${stylex.props(styles.label).className}`}>
          {tr('trainAiCompare')}
        </div>
        <p className={`trainer-settle-hint ${stylex.props(styles.hint).className}`}>
          {tr('trainNoAi')}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`trainer-review-coach ${stylex.props(styles.root).className}`}
      data-testid="trainer-coach-compare"
    >
      <div className={`trainer-label ${stylex.props(styles.label).className}`}>
        {tr('trainAiCalls')}
        {calls.length}
        {tr('trainTimes')}
      </div>
      {error && (
        <span className={`trainer-order-error ${stylex.props(styles.error).className}`}>
          {error}
        </span>
      )}
      {calls.map((call, index) => {
        const plan = coachPlanLine(call);
        const verdict = call.verdict;
        return (
          <article
            className={`trainer-coach-card ${stylex.props(styles.card).className}`}
            key={call.id}
          >
            <header className={`trainer-coach-head ${stylex.props(styles.head).className}`}>
              <button
                className={`trainer-chip trainer-coach-at ${stylex.props(styles.chip, styles.at).className}`}
                onClick={() => onSeek(call.id)}
              >
                {tr('trainCoachCall', { count: index + 1, bar: coachBarLabel(call.cursor, tr) })}
              </button>
              <span>
                AI：<b>{DIRECTION_LABEL(tr)[call.ai.direction]}</b>
                {plan.prices && (
                  <span className={`num ${stylex.props(styles.num).className}`}>
                    {' '}
                    {plan.prices}
                  </span>
                )}
              </span>
              <span className={`trainer-settle-hint ${stylex.props(styles.hint).className}`}>
                {call.humanBefore
                  ? tr('trainYourStance', {
                      value1: DIRECTION_LABEL(tr)[call.humanBefore.direction],
                    })
                  : tr('trainNoStance')}
              </span>
              {verdict && (
                <>
                  {verdict.agreement && (
                    <span
                      className={`trainer-chip trainer-chip--${verdict.agreement} ${stylex.props(styles.chip, verdict.agreement === 'persuaded' && styles.persuaded).className}`}
                    >
                      {AGREEMENT_LABEL[verdict.agreement]}
                    </span>
                  )}
                  <span
                    className={`trainer-chip trainer-chip--${verdict.directionCorrect ? 'hit' : 'miss'} ${stylex.props(styles.chip, verdict.directionCorrect ? styles.hit : styles.miss).className}`}
                  >
                    {OUTCOME_LABEL[verdict.outcome]}
                    {verdict.realizedR !== null && ` · ${signed(verdict.realizedR)}R`}
                    {verdict.plannedRewardRisk !== null &&
                      tr('trainPlannedRrSuffix', { value1: fmt(verdict.plannedRewardRisk) })}
                  </span>
                </>
              )}
            </header>
            <p className={`trainer-coach-body ${stylex.props(styles.body).className}`}>
              {call.ai.comment}
            </p>
            {/* Only calls the market confirmed get an annotation row. Asking about a call whose
                direction was already refuted buys nothing and trains clicking through. */}
            {verdict?.directionCorrect ? (
              <div className={`trainer-coach-annotate ${stylex.props(styles.annotate).className}`}>
                <span className={`trainer-settle-hint ${stylex.props(styles.hint).className}`}>
                  {tr('trainReasonSound')}
                </span>
                {ANNOTATION_ORDER.map((option) => {
                  const selected = call.annotation?.verdict === option;
                  const disabled = pending === call.id;
                  return (
                    <button
                      key={option}
                      className={`btn${selected ? ' btn--accent' : ''} ${stylex.props(styles.button, selected && styles.accent, disabled && styles.disabled).className}`}
                      disabled={disabled}
                      onClick={() => void annotate(call.id, option)}
                    >
                      {ANNOTATION_LABEL[option]}
                    </button>
                  );
                })}
              </div>
            ) : (
              verdict && (
                <p className={`trainer-settle-hint ${stylex.props(styles.hint).className}`}>
                  {tr('trainWrongDirection')}
                </p>
              )
            )}
          </article>
        );
      })}
    </div>
  );
}
