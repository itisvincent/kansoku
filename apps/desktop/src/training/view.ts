import type { TrainerView } from '@kansoku/pro-api';
import {
  buildEpisodeQuestionView,
  episodeNetR,
  episodePeriodLadder,
  remainingEpisodeBars,
} from './episode.js';
import type { LocalCase, LocalSession } from './model.js';

export function sessionView(session: LocalSession, record: LocalCase): TrainerView {
  const question = buildEpisodeQuestionView(record.question, session.state);
  const ladder = episodePeriodLadder(record.basePeriod);
  const state = session.state;
  return {
    caseId: record.id,
    symbol: question.symbol,
    basePeriod: record.basePeriod,
    ladder,
    cursor: state.cursor,
    asOf: question.cutoff,
    bars: {
      base: question.fixtures.kline[ladder[0]] ?? [],
      mid: question.fixtures.kline[ladder[1]] ?? [],
      top: question.fixtures.kline[ladder[2]] ?? [],
    },
    quote: question.fixtures.quote,
    phase: state.phase,
    order: state.order,
    position: state.position,
    trades: state.trades,
    netR: episodeNetR(state),
    remainingBars: remainingEpisodeBars(state, record.question),
    terminal: state.phase === 'terminal',
    result: state.result,
  };
}
