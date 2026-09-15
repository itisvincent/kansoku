import { randomInt, randomUUID } from 'node:crypto';
import type { TrainerBasePeriod, TrainerViewPeriod } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import {
  anonymizeEpisodeQuestion,
  assembleEpisodeQuestion,
  barsPerSession,
  episodePeriodLadder,
  fetchKlineHistoryPaged,
  marketCloseIso,
  marketDate,
  requiredBaseBars,
} from './episode.js';
import type { LocalCase } from './model.js';

export const TRAINER_SYMBOLS = [
  'AAPL.US',
  'MSFT.US',
  'NVDA.US',
  'AMZN.US',
  'META.US',
  'GOOGL.US',
  'AMD.US',
  'TSLA.US',
  'NFLX.US',
  'JPM.US',
  'XOM.US',
  'BA.US',
  'UBER.US',
  'COST.US',
  'WMT.US',
  'KO.US',
  'DIS.US',
  'AVGO.US',
  'ORCL.US',
  'CRM.US',
] as const;
const HORIZON = 160;
const EPILOGUE = 30;

export interface TrainingDataSource {
  getKline(symbol: string, period: string, count: number): Promise<RawBar[]>;
  getKlineHistory?(symbol: string, period: string, start: string, end: string): Promise<RawBar[]>;
}

export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Only completed regular-session bars enter a case. Never replace missing market data
// with synthetic prices; anonymization scales real OHLCV after assembly.
export function cleanBars(bars: RawBar[], today: string, period: TrainerViewPeriod): RawBar[] {
  const byTime = new Map<number, RawBar>();
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (const bar of bars) {
    const time = Date.parse(bar.time);
    if (!Number.isFinite(time) || marketDate(bar.time) >= today) continue;
    if (period !== 'day' && period !== 'week' && bar.time.includes('T')) {
      const parts = clock.formatToParts(new Date(time));
      const minutes =
        Number(parts.find((p) => p.type === 'hour')?.value) * 60 +
        Number(parts.find((p) => p.type === 'minute')?.value);
      if (minutes < 570 || minutes >= 960) continue;
    }
    const [open, high, low, close, volume] = [
      bar.open,
      bar.high,
      bar.low,
      bar.close,
      bar.volume,
    ].map(Number);
    if (![open, high, low, close, volume].every(Number.isFinite) || low <= 0 || volume < 0) {
      throw new Error('Historical candles contain invalid prices or volume');
    }
    byTime.set(time, { time: bar.time, open, high, low, close, volume });
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([, bar]) => bar);
}

export function assembleLocalCase(input: {
  symbol: string;
  basePeriod: TrainerBasePeriod;
  tiers: readonly [RawBar[], RawBar[], RawBar[]];
  used: ReadonlySet<string>;
}): LocalCase {
  const {
    symbol,
    basePeriod,
    tiers: [baseBars, midBars, topBars],
    used,
  } = input;
  const cutoffs = [...new Set(baseBars.map((bar) => marketDate(bar.time)))].filter((date) => {
    const before = baseBars.filter(
      (bar) => Date.parse(bar.time) < Date.parse(marketCloseIso(date)),
    ).length;
    return (
      before >= requiredBaseBars(basePeriod) &&
      baseBars.length - before >= HORIZON + EPILOGUE &&
      !used.has(`${symbol}:${basePeriod}:${date}`)
    );
  });
  for (const cutoffDate of shuffled(cutoffs)) {
    let source;
    try {
      source = assembleEpisodeQuestion({
        symbol,
        basePeriod,
        cutoffDate,
        baseBars,
        midBars,
        topBars,
        layer: 'local-history',
        // End at a completed session so the final higher-timeframe bar is complete too.
        horizonSessions: Math.ceil(HORIZON / barsPerSession(basePeriod)),
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('insufficient ')) continue;
      throw error;
    }
    const last = Date.parse(source.replay.bars.at(-1)!.time);
    const epilogue = baseBars.filter((bar) => Date.parse(bar.time) > last).slice(0, EPILOGUE);
    if (epilogue.length < EPILOGUE) continue;
    // Validate the selected window, including future rollups. An inconsistent candle
    // years outside this case must not reject otherwise usable recent history.
    const selectedBars = [
      ...Object.values(source.fixtures.kline).flat(),
      ...source.replay.bars,
      ...Object.values(source.replay.rollups ?? {})
        .flat()
        .map((item) => item.bar),
      ...epilogue,
    ];
    if (
      selectedBars.some(
        (bar) =>
          Number(bar.low) > Math.min(Number(bar.open), Number(bar.close)) ||
          Number(bar.high) < Math.max(Number(bar.open), Number(bar.close)),
      )
    )
      continue;
    const shifted = new Date(`${cutoffDate}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() - 7 * randomInt(1100, 1900));
    const blind = anonymizeEpisodeQuestion(
      source,
      {
        alias: `ASSET${randomInt(100, 1000)}`,
        syntheticCutoff: shifted.toISOString().slice(0, 10),
      },
      epilogue,
    );
    const id = randomUUID();
    return {
      id,
      basePeriod,
      sourceKey: `${symbol}:${basePeriod}:${cutoffDate}`,
      question: { ...blind.question, id },
      provenance: { ...blind.provenance, outputId: id },
      epilogue: blind.epilogue ?? [],
    };
  }
  throw new Error('Not enough unused, completed historical candles for a training case');
}

export async function fetchLocalCase(
  provider: TrainingDataSource,
  symbol: string,
  basePeriod: TrainerBasePeriod,
  used: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<LocalCase> {
  const today = marketDate(new Date().toISOString());
  const tiers: RawBar[][] = [];
  for (const period of episodePeriodLadder(basePeriod)) {
    signal.throwIfAborted();
    let bars: RawBar[];
    // A 1m case needs two full sessions of lookback plus its playable segment;
    // the CLI's 1,000-bar page often cuts through the first needed session.
    if (period === '1m' && provider.getKlineHistory) {
      const start = new Date(`${today}T00:00:00Z`);
      start.setUTCDate(start.getUTCDate() - 14);
      bars = await fetchKlineHistoryPaged(
        (from, to) => {
          signal.throwIfAborted();
          return provider.getKlineHistory!(symbol, period, from, to);
        },
        start.toISOString().slice(0, 10),
        today,
      );
    } else {
      bars = await provider.getKline(symbol, period satisfies TrainerViewPeriod, 1000);
    }
    tiers.push(cleanBars(bars, today, period));
  }
  signal.throwIfAborted();
  return assembleLocalCase({ symbol, basePeriod, tiers: [tiers[0], tiers[1], tiers[2]], used });
}
