import type { TrainerClosedTrade, TrainerStats } from '@kansoku/pro-api';
import { trainerMfeGivebackR, trainerPlannedRewardRisk } from '@kansoku/pro-api';
import type { LocalCase, LocalSession } from './model.js';
import { periodCounts } from './model.js';
import { reviewFacts } from './review.js';

const MIN_SAMPLES = 10;
const mean = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const winRate = (trades: TrainerClosedTrade[]) =>
  mean(trades.map((trade) => Number(trade.netR > 0)));

export function buildStats(sessions: LocalSession[], cases: Map<string, LocalCase>): TrainerStats {
  const completed = sessions.filter((session) => session.state.phase === 'terminal');
  const trades = completed.flatMap((session) => session.state.trades);
  const samples = completed.length;
  const locked = samples < MIN_SAMPLES;
  const sessionsByBasePeriod = periodCounts();
  for (const session of completed) {
    const record = cases.get(session.caseId);
    if (record) sessionsByBasePeriod[record.basePeriod]++;
  }
  const netR = trades.reduce((sum, trade) => sum + trade.netR, 0);
  const wins = trades.filter((trade) => trade.netR > 0).map((trade) => trade.netR);
  const losses = trades.filter((trade) => trade.netR < 0).map((trade) => -trade.netR);
  const averageWin = mean(wins);
  const averageLoss = mean(losses);
  const stops = completed.flatMap((session) => {
    const record = cases.get(session.caseId);
    const stop = record && reviewFacts(session, record).stopAutopsy;
    return stop ? [stop] : [];
  });
  const fast = completed.flatMap((session) =>
    session.state.trades.filter((trade) => session.fastForwardTrades.includes(trade.tradeId)),
  );
  const slow = completed.flatMap((session) =>
    session.state.trades.filter((trade) => !session.fastForwardTrades.includes(trade.tradeId)),
  );
  return {
    completedSessions: samples,
    unfinishedSessions: sessions.length - samples,
    sessionsByBasePeriod,
    overview: {
      samples,
      locked,
      netR,
      winRate: locked ? null : winRate(trades),
      plannedRewardRisk: locked
        ? null
        : mean(
            trades.map(trainerPlannedRewardRisk).filter((ratio): ratio is number => ratio !== null),
          ),
      realizedRewardRisk:
        locked || averageWin == null || !averageLoss ? null : averageWin / averageLoss,
      mfeGivebackRate: locked
        ? null
        : mean(
            trades
              .filter((trade) => trade.mfeR > 0)
              .map((trade) => trainerMfeGivebackR(trade) / trade.mfeR),
          ),
    },
    byTag: samples
      ? [{ tag: null, samples, locked, netR, winRate: locked ? null : winRate(trades) }]
      : [],
    stopHealth: {
      samples,
      locked,
      reachedTargetAfterStopRate: locked
        ? null
        : mean(stops.map((stop) => Number(stop.reachedTargetAfter))),
      averageOvershootPct: locked ? null : mean(stops.map((stop) => stop.overshootPct)),
    },
    advanceStyle: {
      samples,
      locked,
      barByBarWinRate: locked ? null : winRate(slow),
      fastForwardWinRate: locked ? null : winRate(fast),
    },
    coachInfluence: {
      samples: 0,
      locked: true,
      persuadedCount: 0,
      persuadedWinRate: null,
      heldCount: 0,
      heldWinRate: null,
    },
    coachScorecard: {
      samples: 0,
      locked: true,
      settled: 0,
      annotated: 0,
      directionAccuracy: null,
      soundReasonRate: null,
      rightCallWrongReasonRate: null,
    },
  };
}
