import { chineseTranslator, type Translator } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import * as stylex from '@stylexjs/stylex';
import type { TrainerDirection } from '@kansoku/pro-api';
import { fmt } from '@web/lib/format';
import { Button } from '../../ui/Button';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { formatRewardRisk, meetsRewardRiskFloor, rewardRiskRatio } from './orderDraft';
import { TrainerNote } from './TrainerNote';
import type { EntryDraftApi } from './useEntryDraft';

function DIRECTION_LABEL(tr: Translator = chineseTranslator): Record<TrainerDirection, string> {
  return { long: tr('trainLong'), short: tr('trainShort') };
}

const styles = stylex.create({
  lane: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'flex',
    flex: '0 0 auto',
    gap: '8px',
    height: '38px',
    overflowX: 'clip',
    overflowY: 'visible',
    padding: '0 12px',
    position: 'relative',
  },
  group: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
    gap: '4px',
  },
  separator: {
    backgroundColor: colors.borderStrong,
    flex: '0 0 auto',
    height: '16px',
    width: '1px',
  },
  spacer: {
    marginLeft: 'auto',
  },
  label: {
    color: colors.textSecondary,
    flex: '0 0 auto',
    fontSize: fontSizes.sm,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  hintWarn: {
    color: colors.accent,
  },
  chipLong: {
    color: colors.up,
    fontWeight: 600,
  },
  chipShort: {
    color: colors.down,
    fontWeight: 600,
  },
  directionLong: {
    ':not(:disabled):is([aria-pressed="false"])': {
      borderColor: `color-mix(in srgb, ${colors.up} 55%, transparent)`,
      color: colors.up,
    },
    ':not(:disabled):is([aria-pressed="true"])': {
      borderColor: colors.accent,
      color: colors.accent,
    },
  },
  directionShort: {
    ':not(:disabled):is([aria-pressed="false"])': {
      borderColor: `color-mix(in srgb, ${colors.down} 55%, transparent)`,
      color: colors.down,
    },
    ':not(:disabled):is([aria-pressed="true"])': {
      borderColor: colors.accent,
      color: colors.accent,
    },
  },
  num: {
    flex: '0 0 auto',
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  numStop: {
    color: colors.down,
  },
  numTarget: {
    color: colors.up,
  },
  numRewardRisk: {
    color: colors.accent,
  },
  numWarn: {
    color: colors.accent,
  },
});

function sideRule(
  direction: TrainerDirection,
  entry: number,
  tr: Translator = chineseTranslator,
): string {
  return direction === 'long'
    ? tr('trainLongSideRule', { value1: fmt(entry) })
    : tr('trainShortSideRule', { value1: fmt(entry) });
}

function entryHint(
  entry: EntryDraftApi,
  tr: Translator = chineseTranslator,
): { text: string; warn: boolean } {
  const { direction, autoFill, stale, placement } = entry;
  if (!direction) return { text: tr('trainPickDirection'), warn: false };
  if (autoFill === 'unavailable') return { text: tr('trainNoAutoStop'), warn: true };
  if (stale)
    return {
      text: tr('trainStaleEntry', {
        value1: fmt(entry.entry),
        value2: sideRule(direction, entry.entry, tr),
      }),
      warn: true,
    };
  const missing: string[] = [];
  if (placement.stop === null) missing.push(tr('trainPlaceSl'));
  if (placement.target === null) missing.push(tr('trainPlaceTp'));
  if (missing.length > 0)
    return { text: tr('trainPullLevels', { value1: missing.join('、') }), warn: false };
  if (autoFill === 'filled') return { text: tr('trainAutoStopHelp'), warn: false };
  return {
    text: tr('trainCancelDirectionHelp', { value1: DIRECTION_LABEL(tr)[direction] }),
    warn: false,
  };
}

// Present in both states of the lane: with nothing drawn they pick the side, and with a draft on
// the chart the picked side redraws it while the other side flips it. Dropping them from the draft
// state would leave no way back to the opposite direction short of submitting.
function DirectionButtons({ entry }: { entry: EntryDraftApi }) {
  const { t: tr } = useLocale();
  return (
    <div className={`trainer-lane-group ${stylex.props(styles.group).className}`}>
      <Button
        className={`btn--long ${stylex.props(styles.directionLong).className}`}
        aria-pressed={entry.direction === 'long'}
        onClick={() => entry.pickDirection('long')}
      >
        {tr('trainLong')}
      </Button>
      <Button
        className={`btn--short ${stylex.props(styles.directionShort).className}`}
        aria-pressed={entry.direction === 'short'}
        onClick={() => entry.pickDirection('short')}
      >
        {tr('trainShort')}
      </Button>
    </div>
  );
}

export interface TrainerEntryLaneProps {
  entry: EntryDraftApi;
  note: string;
  onNoteChange: (value: string) => void;
}

export function TrainerEntryLane({ entry, note, onNoteChange }: TrainerEntryLaneProps) {
  const { t: tr } = useLocale();
  const { draft } = entry;
  const hint = entryHint(entry, tr);

  if (!draft) {
    return (
      <div className={`trainer-lane ${stylex.props(styles.lane).className}`}>
        <span className={`trainer-lane-label ${stylex.props(styles.label).className}`}>
          {tr('trainDirection')}
        </span>
        <DirectionButtons entry={entry} />
        <div className={`trainer-lane-sep ${stylex.props(styles.separator).className}`} />
        <span className={`trainer-lane-label ${stylex.props(styles.label).className}`}>
          {tr('trainMarketEntry')}
        </span>
        <div className={`trainer-lane-group ${stylex.props(styles.group).className}`}>
          <Button
            className={`btn--long ${stylex.props(styles.directionLong).className}`}
            aria-pressed={false}
            onClick={() => entry.quickEntry('long')}
          >
            {tr('trainMarketLong')}
          </Button>
          <Button
            className={`btn--short ${stylex.props(styles.directionShort).className}`}
            aria-pressed={false}
            onClick={() => entry.quickEntry('short')}
          >
            {tr('trainMarketShort')}
          </Button>
        </div>
        <div className={`trainer-lane-sep ${stylex.props(styles.separator).className}`} />
        <span
          className={`trainer-lane-hint${hint.warn ? ' trainer-lane-hint--warn' : ''} ${stylex.props(styles.hint, hint.warn && styles.hintWarn).className}`}
        >
          {hint.text}
        </span>
      </div>
    );
  }

  const rr = rewardRiskRatio(draft);
  const rrOk = meetsRewardRiskFloor(draft);

  return (
    <div className={`trainer-lane ${stylex.props(styles.lane).className}`}>
      <span
        className={`${draft.direction === 'long' ? 'trainer-chip-long' : 'trainer-chip-short'} ${stylex.props(draft.direction === 'long' ? styles.chipLong : styles.chipShort).className}`}
      >
        {DIRECTION_LABEL(tr)[draft.direction]}
      </span>
      <span className={`trainer-lane-num ${stylex.props(styles.num).className}`}>
        {tr('trainEntry')} {fmt(draft.entry)}
      </span>
      <span
        className={`trainer-lane-num trainer-lane-num--stop ${stylex.props(styles.num, styles.numStop).className}`}
      >
        {tr('trainStop')} {fmt(draft.stop)}
      </span>
      <span
        className={`trainer-lane-num trainer-lane-num--target${rrOk ? '' : ' trainer-lane-num--warn'} ${stylex.props(styles.num, styles.numTarget, !rrOk && styles.numWarn).className}`}
      >
        {tr('trainTarget')} {fmt(draft.target1)}
      </span>
      <span
        className={`trainer-lane-num trainer-lane-num--rr${rrOk ? '' : ' trainer-lane-num--warn'} ${stylex.props(styles.num, styles.numRewardRisk, !rrOk && styles.numWarn).className}`}
      >
        {tr('trainRewardRisk')}
        {rr === null ? '—' : `${formatRewardRisk(rr)} : 1`}
      </span>
      <span className={`trainer-lane-spacer ${stylex.props(styles.spacer).className}`} />
      {/* The entry buttons live on the ticket, next to the plan they commit — one place to send an
          order, not two that have to be kept in step. */}
      {!rrOk && (
        <span
          className={`trainer-lane-hint trainer-lane-hint--warn ${stylex.props(styles.hint, styles.hintWarn).className}`}
        >
          {tr('trainBelowFloor')}
        </span>
      )}
      <TrainerNote
        label={tr('trainNote')}
        value={note}
        onChange={onNoteChange}
        hint={tr('trainEntryNote')}
      />
      <DirectionButtons entry={entry} />
    </div>
  );
}
