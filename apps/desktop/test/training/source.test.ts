import { describe, expect, it } from 'vitest';
import { assembleLocalCase, cleanBars } from '../../src/training/source.js';
import { candle } from './fixtures.js';
import { marketCloseIso } from '../../src/training/episode.js';

function history(minutes: number) {
  const result = [];
  for (let i = 0; i < 60; i++) {
    const date = new Date(Date.UTC(2024, 0, 1 + i));
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const day = date.toISOString().slice(0, 10);
    const start = Date.parse(`${day}T09:30:00${marketCloseIso(day).slice(-6)}`);
    for (let m = 0; m < 390; m += minutes) {
      result.push(candle(new Date(start + m * 60_000).toISOString(), 80 + i / 100 + m / 10000));
    }
  }
  return result;
}

describe('local historical case assembly', () => {
  it('preserves daily/weekly midnight timestamps while excluding unfinished and extended-session bars', () => {
    const bars = [
      candle('2026-09-11T04:00:00Z', 100),
      candle('2026-09-11T13:30:00Z', 101),
      candle('2026-09-11T20:00:00Z', 102),
      candle('2026-09-14T13:30:00Z', 103),
    ];
    expect(cleanBars(bars, '2026-09-14', '5m').map((bar) => bar.open)).toEqual([101]);
    expect(cleanBars([bars[0]], '2026-09-14', 'day')).toHaveLength(1);
    expect(cleanBars([bars[0]], '2026-09-14', 'week')).toHaveLength(1);
    expect(() => cleanBars([candle('2026-09-11T13:30:00Z', NaN)], '2026-09-14', '5m')).toThrow(
      'invalid',
    );
  });

  it('assembles and anonymizes completed history with a separate epilogue and no identity in the question', () => {
    const record = assembleLocalCase({
      symbol: 'SOURCE.US',
      basePeriod: '5m',
      tiers: [history(5), history(15), history(60)],
      used: new Set(),
    });
    expect(record.question.fixtures.kline['5m']).toHaveLength(210);
    expect(record.question.fixtures.kline['15m']).toHaveLength(250);
    expect(record.question.fixtures.kline['1h']).toHaveLength(104);
    expect(record.question.replay.bars).toHaveLength(234);
    expect(record.epilogue).toHaveLength(30);
    expect(Date.parse(record.epilogue[0].time)).toBeGreaterThan(
      Date.parse(record.question.replay.bars.at(-1)!.time),
    );
    expect(record.question.fixtures.quote.last).toBe(100);
    expect(JSON.stringify(record.question)).not.toContain('SOURCE.US');
    expect(JSON.stringify(record.question)).not.toContain('2024-');
    expect(record.provenance.dayShift % 7).toBe(-0);
    expect(record.provenance.sourceSymbol).toBe('SOURCE.US');
  });
});
