import { chineseTranslator, type Translator } from '@web/lib/i18n';
import type { TrainerBasePeriod, TrainerEvent, TrainerStepEvent } from '@kansoku/pro-api';

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const BASE_PLAYBACK_INTERVAL_MS = 600;

export function playbackIntervalMs(speed: PlaybackSpeed): number {
  return BASE_PLAYBACK_INTERVAL_MS / speed;
}

// Exhaustive on purpose, mirroring session.ts's NOTABLE_EVENT: the wire only ever puts the
// notable half of TrainerEvent into events[], but a Record over the full union means a future
// event type forces a decision here instead of silently rendering "undefined".

export function describeStepEvent(
  event: TrainerStepEvent,
  basePeriod: TrainerBasePeriod,
  tr: Translator = chineseTranslator,
): string {
  const STEP_EVENT_LABEL: Record<TrainerEvent, string> = {
    observed: tr('trainObserved'),
    abstained: tr('trainAbstained'),
    waiting_fill: tr('trainWaitingFill'),
    holding: tr('trainHolding'),
    filled: tr('trainFilled'),
    cancelled: tr('trainTerminationCancelled'),
    no_fill: tr('trainOrderTimeout'),
    stop_hit: tr('trainStopHit'),
    target_hit: tr('trainTargetHit'),
    manual_exit: tr('trainManualExit'),
    horizon_exit: tr('trainTimeExit'),
  };

  return tr('trainStepEvent', {
    value1: event.barOffset,
    value2: basePeriod,
    value3: STEP_EVENT_LABEL[event.event],
  });
}

export function describeStepEvents(
  events: readonly TrainerStepEvent[],
  basePeriod: TrainerBasePeriod,
  tr: Translator = chineseTranslator,
): string {
  return events.map((event) => describeStepEvent(event, basePeriod, tr)).join('，');
}

// The bar that fills a market order is also checked against the bracket, and the engine reports
// only the exit when both land on it — so a trade that filled and stopped inside one bar arrives
// as a bare 'stop_hit', reading as if the order had vanished without ever opening. Only the caller
// knows it just submitted, so only the caller can say that the fill happened at all.
export function describeEntryOutcome(
  events: readonly TrainerStepEvent[],
  basePeriod: TrainerBasePeriod,
  tr: Translator = chineseTranslator,
): string {
  const exit = events.find((e) => e.event === 'stop_hit' || e.event === 'target_hit');
  if (exit) {
    const what = exit.event === 'stop_hit' ? tr('trainStopHit') : tr('trainTargetHit');
    return tr('trainFilledAndExited', { value1: basePeriod, value2: what });
  }
  if (events.some((e) => e.event === 'horizon_exit')) {
    return tr('trainFilledAtTimeLimit', { value1: basePeriod });
  }
  return tr('trainFilledNextOpen', { value1: basePeriod });
}
