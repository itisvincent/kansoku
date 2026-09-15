import type {
  TrainerBasePeriod,
  TrainerFillState,
  TrainerLesson,
  TrainerProvenance,
} from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { EpisodeState, Question } from './episode.js';

export const BASE_PERIODS: readonly TrainerBasePeriod[] = ['1m', '5m', '15m', '30m', '1h'];
export const periodCounts = (): Record<TrainerBasePeriod, number> => ({
  '1m': 0,
  '5m': 0,
  '15m': 0,
  '30m': 0,
  '1h': 0,
});

// These records never cross IPC. Only the cursor-limited TrainerView does.
export interface LocalCase {
  id: string;
  basePeriod: TrainerBasePeriod;
  sourceKey: string;
  question: Question;
  provenance: TrainerProvenance;
  epilogue: RawBar[];
}

export interface LocalSession {
  id: string;
  caseId: string;
  state: EpisodeState;
  lesson: TrainerLesson | null;
  openedAt: string;
  updatedAt: string;
  fastForwardTrades: number[];
}

export interface TrainerMetadata extends TrainerFillState {
  version: 1;
}
