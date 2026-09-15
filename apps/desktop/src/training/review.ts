import type {
  TrainerReviewEvent,
  TrainerReviewFacts,
  TrainerReviewPayload,
  TrainerStopAutopsy,
} from '@kansoku/pro-api';
import { episodePeriodLadder } from './episode.js';
import type { LocalCase, LocalSession } from './model.js';

export function reviewFacts(session: LocalSession, record: LocalCase): TrainerReviewFacts {
  const trades = session.state.trades;
  const stopped = [...trades].reverse().find((trade) => trade.exitReason === 'stop');
  let stopAutopsy: TrainerStopAutopsy | null = null;
  if (stopped) {
    const overshoot = Math.max(
      0,
      stopped.direction === 'long'
        ? stopped.finalStop - stopped.exit.price
        : stopped.exit.price - stopped.finalStop,
    );
    stopAutopsy = {
      tradeId: stopped.tradeId,
      stop: stopped.finalStop,
      overshoot,
      overshootPct: (overshoot / Math.abs(stopped.finalStop)) * 100,
      reachedTargetAfter: record.question.replay.bars.some(
        (bar) =>
          Date.parse(bar.time) > Date.parse(stopped.exit.time) &&
          (stopped.direction === 'long'
            ? Number(bar.high) >= stopped.target
            : Number(bar.low) <= stopped.target),
      ),
    };
  }
  const last = trades.at(-1);
  if (!last || !record.epilogue.length) {
    return { stopAutopsy, holdToEpilogueEndR: null, afterExitHighR: null, afterExitLowR: null };
  }
  const sign = last.direction === 'long' ? 1 : -1;
  const toR = (price: number) => (sign * (price - last.entry.price)) / last.initialRisk;
  const values = record.epilogue.flatMap((bar) => [toR(Number(bar.high)), toR(Number(bar.low))]);
  return {
    stopAutopsy,
    holdToEpilogueEndR: toR(Number(record.epilogue.at(-1)!.close)),
    afterExitHighR: Math.max(...values),
    afterExitLowR: Math.min(...values),
  };
}

export function buildReview(session: LocalSession, record: LocalCase): TrainerReviewPayload {
  const replay = record.question.replay.bars;
  const index = (time: string) => {
    const i = replay.findIndex((bar) => Date.parse(bar.time) === Date.parse(time));
    return i === -1 ? null : i;
  };
  const events: TrainerReviewEvent[] = session.state.trades
    .flatMap((trade) => {
      const entries: TrainerReviewEvent[] = (trade.lots ?? [{ ...trade.entry, size: 1 }]).map(
        (lot) => ({
          kind: 'entry',
          at: lot.time,
          barIndex: index(lot.time),
          price: lot.price,
          label: `#${trade.tradeId} ${trade.direction} (${Math.round(lot.size * 100)}%)`,
        }),
      );
      const exits: TrainerReviewEvent[] = (
        trade.exits ?? [{ ...trade.exit, size: 1, reason: trade.exitReason }]
      ).map((exit) => ({
        kind:
          exit.reason === 'manual'
            ? 'manual_exit'
            : exit.reason === 'horizon'
              ? 'horizon_exit'
              : exit.reason,
        at: exit.time,
        barIndex: index(exit.time),
        price: exit.price,
        label: `#${trade.tradeId} ${exit.reason} (${Math.round(exit.size * 100)}%)`,
      }));
      return [...entries, ...exits];
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    sessionId: session.id,
    caseId: record.id,
    symbol: record.question.symbol,
    basePeriod: record.basePeriod,
    ladder: episodePeriodLadder(record.basePeriod),
    provenance: record.provenance,
    tag: null,
    lookback: record.question.fixtures.kline[record.basePeriod] ?? [],
    replay,
    epilogue: record.epilogue,
    playedThrough: session.state.cursor,
    trades: session.state.trades,
    result: session.state.result,
    events,
    coach: [],
    facts: reviewFacts(session, record),
    lesson: session.lesson,
  };
}
