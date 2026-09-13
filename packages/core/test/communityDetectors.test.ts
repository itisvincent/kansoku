import { describe, expect, it } from 'vitest';
import {
  communityDetectors,
  detect123Patterns,
  detectCandlePatterns,
  detectSecondBreakouts,
  enrichCandlePatterns,
  findMacdBeichi,
  findPriceDivergence,
} from '../src/analysis/intraday/communityDetectors.js';

const ts = (n: number) => 1000 + n * 60;

describe('findPriceDivergence', () => {
  it('flags top divergence on higher price + lower macd', () => {
    const pts = [
      { time: ts(0), price: 100, macd_value: 5 },
      { time: ts(1), price: 105, macd_value: 3 },
    ];
    expect(findPriceDivergence(pts, true)).toEqual([
      { kind: 'top', a: pts[0], b: pts[1] },
    ]);
    expect(findPriceDivergence(pts, false)).toEqual([]);
  });

  it('flags bottom divergence on lower price + higher macd', () => {
    const pts = [
      { time: ts(0), price: 100, macd_value: -5 },
      { time: ts(1), price: 96, macd_value: -2 },
    ];
    expect(findPriceDivergence(pts, false)).toEqual([
      { kind: 'bottom', a: pts[0], b: pts[1] },
    ]);
  });
});

describe('findMacdBeichi', () => {
  it('detects a top beichi between two swing highs via hist values', () => {
    const highs = [25, 27, 29, 30, 29.5, 28, 27, 28, 30, 31, 32, 31, 30, 29, 28, 27];
    const lows = highs.map((h) => h - 5);
    const timesTs = highs.map((_, i) => ts(i));
    const hist: (number | null)[] = highs.map(() => null);
    hist[3] = 5;
    hist[10] = 3;
    const tops = findMacdBeichi(hist, highs, lows, timesTs).filter((d) => d.kind === 'top');
    expect(tops).toHaveLength(1);
    expect(tops[0].a).toEqual({ time: ts(3), price: 30, macd_value: 5 });
    expect(tops[0].b).toEqual({ time: ts(10), price: 32, macd_value: 3 });
  });
});

describe('detect123Patterns', () => {
  const lows = [
    14, 12, 11, 10.5, 10, 10.2, 11, 12, 13, 15, 16, 15, 14, 13, 12, 12.5, 13, 14, 15, 16, 17,
  ];
  const highs = [
    15, 16, 17, 18, 19, 19.5, 19.8, 19.9, 19.95, 20, 19, 18, 17, 16, 15, 15.5, 21.5, 22.5, 23.5,
    24.5, 25,
  ];
  const closes = [
    13.5, 12.5, 11.5, 11, 10.5, 10.8, 12, 13.5, 15, 17, 17.5, 16, 15, 14, 13, 15.5, 21, 22, 23, 24,
    24.5,
  ];
  const timesTs = lows.map((_, i) => ts(i));

  it('confirms a bullish 123 when a close crosses above ②', () => {
    const out = detect123Patterns(highs, lows, closes, timesTs);
    expect(out).toHaveLength(1);
    const p = out[0];
    expect(p.kind).toBe('bullish');
    expect(p.status).toBe('confirmed');
    expect(p.p1.price).toBe(10);
    expect(p.p2.price).toBe(20);
    expect(p.p3.price).toBe(12);
    expect(p.trigger).toBe(20);
    expect(p.invalidation).toBe(12);
    expect(p.confirm).toEqual({ time: ts(16), price: 21 });
  });

  it('drops a pattern invalidated by a close through ③', () => {
    const deadCloses = [...closes];
    deadCloses[16] = 11.5; // 跌破 ③(12)，作废
    deadCloses[17] = 11;
    const out = detect123Patterns(highs, lows, deadCloses, timesTs);
    expect(out).toHaveLength(0);
  });
});

describe('detectSecondBreakouts', () => {
  const highs = [
    46, 47, 48, 49, 49.5, 49.8, 50, 49.5, 49, 48, 47.5, 47, 50, 49, 48.5, 51.5, 52, 52.5, 53, 53.5,
  ];
  const lows = [
    45, 45.5, 46, 46.5, 47, 47.5, 48, 48.5, 48, 47, 46.5, 46, 47, 48, 47, 50, 50.5, 51, 51.5, 52,
  ];
  const timesTs = highs.map((_, i) => ts(i));

  it('confirms H2 on a close above the first swing high', () => {
    const closes = [
      45.5, 46, 46.5, 47, 47.8, 48.2, 49, 49, 48.5, 47.5, 47, 46.5, 48.5, 48.5, 47.8, 51, 51.5, 52,
      52.5, 53,
    ];
    const out = detectSecondBreakouts(highs, lows, closes, timesTs);
    const confirmed = out.filter((sb) => sb.status === 'confirmed');
    expect(confirmed).toHaveLength(1);
    const sb = confirmed[0];
    expect(sb.kind).toBe('H2');
    expect(sb.first.price).toBe(50);
    expect(sb.signal.price).toBe(51);
    expect(sb.trigger).toEqual({ time: ts(15), price: 50 });
  });

  it('stays forming with the level price while no close breaks', () => {
    const closes = [
      45.5, 46, 46.5, 47, 47.8, 48.2, 49, 49, 48.5, 47.5, 47, 46.5, 48.5, 48.5, 47.8, 49, 49.2,
      49.4, 49.6, 49.8,
    ];
    const out = detectSecondBreakouts(highs, lows, closes, timesTs);
    const forming = out.filter((sb) => sb.status === 'forming');
    expect(forming.length).toBeGreaterThanOrEqual(1);
    const sb = forming.at(-1)!;
    expect(sb.kind).toBe('H2');
    expect(sb.signal.price).toBe(50); // 酝酿中显示被测价位
    expect(sb.trigger).toBeNull();
  });
});

describe('detectCandlePatterns + enrichCandlePatterns', () => {
  const opens = [100, 100, 100, 100, 105, 104, 103, 102, 100, 100.2, 100.4, 100, 100, 100, 100, 100, 100, 100, 100, 100];
  const closes = [
    100.2, 100.1, 100, 99.8, 104, 103, 102, 101, 100.5, 101.5, 101.7, 101, 101, 101, 101, 101,
    101, 101, 101, 101,
  ];
  const highs = [
    100.5, 100.4, 100.3, 100.1, 105, 104, 103, 102.2, 101, 101.8, 101.9, 101, 101, 101, 101, 101,
    101, 101, 101, 101,
  ];
  const lows = [
    99.8, 99.8, 99.8, 99.7, 103.8, 102.8, 101.8, 100.8, 98, 99.8, 99.8, 100, 100, 100, 100, 100,
    100, 100, 100, 100,
  ];
  const timesTs = closes.map((_, i) => ts(i));

  it('detects a hammer after a decline', () => {
    const out = detectCandlePatterns(opens, highs, lows, closes, timesTs);
    const hammer = out.find((p) => p.kind === 'hammer');
    expect(hammer).toBeDefined();
    expect(hammer!.bias).toBe('bullish');
    expect(hammer!.time).toBe(ts(8));
    expect(hammer!.confirm_price).toBe(101);
    expect(hammer!.invalidate_price).toBe(98);
    expect(hammer!.span).toBe(1);
  });

  it('enrich scores with volume+location and resolves status by follow-through', () => {
    const raw = detectCandlePatterns(opens, highs, lows, closes, timesTs);
    const vols = closes.map(() => 100);
    vols[8] = 300; // 放量
    const ctx = {
      highs,
      lows,
      closes,
      vols,
      timesTs,
      emaArrs: [],
      swingHighs: [],
      swingLows: [{ time: ts(8), price: 100 }],
      fvgZones: [],
    };
    const enriched = enrichCandlePatterns(raw, ctx);
    const hammer = enriched.find((p) => p.kind === 'hammer')!;
    // 48 基础 + 12 放量 + 10 位置 = 70，达到全标记阈值
    expect(hammer.score).toBe(70);
    expect(hammer.status).toBe('confirmed'); // 之后收盘越过确认价 101
  });
});

describe('communityDetectors contract', () => {
  it('exposes all seven ProDetectors members', async () => {
    const d = communityDetectors();
    expect(Object.keys(d).sort()).toEqual([
      'detect123Patterns',
      'detectCandlePatterns',
      'detectSecondBreakouts',
      'enrichCandlePatterns',
      'findMacdBeichi',
      'findPriceDivergence',
      'getOptionsLevels',
    ]);
    await expect(d.getOptionsLevels('AAPL')).resolves.toBeNull();
  });
});