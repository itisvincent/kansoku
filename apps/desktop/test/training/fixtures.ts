import { randomUUID } from 'node:crypto';
import type { TrainerReason, TrainerSubmission } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { LocalCase } from '../../src/training/model.js';

export const reason: TrainerReason = {
  category: 'risk_management',
  summary: 'Test the planned risk.',
};

export function candle(
  time: string,
  open: number,
  high = open + 1,
  low = open - 1,
  close = open,
): RawBar {
  return { time, open, high, low, close, volume: 1000 };
}

export function fixedCase(): LocalCase {
  const id = randomUUID();
  return {
    id,
    basePeriod: '5m',
    sourceKey: `TEST.US:5m:${id}`,
    question: {
      id,
      bank: 'swing',
      symbol: 'ASSET123.SIM',
      layer: 'anonymous',
      adversarial: false,
      cutoff: '2000-01-03T16:00:00-05:00',
      fixtures: {
        kline: {
          '5m': [candle('2000-01-03T15:55:00-05:00', 100)],
          '15m': [candle('2000-01-03T15:45:00-05:00', 100)],
          '1h': [candle('2000-01-03T15:30:00-05:00', 100)],
        },
        quote: { last: 100 },
        indicators: {},
        capitalFlow: {},
        news: [],
        fundamentals: {},
        calendar: {},
      },
      replay: {
        basePeriod: '5m',
        horizonBars: 5,
        entryExpiryBars: 3,
        bars: [
          candle('2000-01-04T09:30:00-05:00', 101, 102, 100, 101),
          candle('2000-01-04T09:35:00-05:00', 102, 103, 101, 102),
          candle('2000-01-04T09:40:00-05:00', 103, 104, 102, 103),
          candle('2000-01-04T09:45:00-05:00', 104, 105, 103, 104),
          candle('2000-01-04T09:50:00-05:00', 105, 107, 104, 106),
        ],
      },
    },
    provenance: {
      outputId: id,
      aliasSymbol: 'ASSET123.SIM',
      sourceId: 'source-test',
      sourceSymbol: 'TEST.US',
      sourceCutoff: '2026-08-31T16:00:00-04:00',
      syntheticCutoff: '2000-01-03T16:00:00-05:00',
      dayShift: -9742,
      priceScale: 2,
      volumeScale: 1,
    },
    epilogue: [candle('2000-01-04T09:55:00-05:00', 108)],
  };
}

export function prediction(overrides: Partial<TrainerSubmission> = {}): TrainerSubmission {
  return {
    direction: 'long',
    anchor: { timeframe: 'm5', time: '2000-01-03T15:55:00-05:00', price: 100 },
    entry_plan: { entry: 100, stop: 90, target1: 120 },
    scenarios: [],
    decision_reason: reason,
    comment: 'Test ticket',
    ...overrides,
  };
}
