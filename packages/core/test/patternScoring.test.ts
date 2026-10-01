import { describe, expect, it } from 'vitest';
import { offSessionSignalKeeper } from '../src/analysis/patternScoring.js';

// 2026-06-01T14:30:00Z = 10:30 ET Monday (regular session)
const REGULAR_BASE = Date.parse('2026-06-01T14:30:00.000Z') / 1000;
// 2026-05-31 is a Sunday — every bar classifies as overnight regardless of index
const OVERNIGHT_BASE = Date.parse('2026-05-31T14:30:00.000Z') / 1000;
const STEP = 300;

function makeTimes(n: number, base: number): number[] {
  return Array.from({ length: n }, (_, i) => base + i * STEP);
}

describe('offSessionSignalKeeper', () => {
  it('keeps overnight structural signals only on a volume impulse', () => {
    const timesTs = makeTimes(40, OVERNIGHT_BASE);
    const vols = Array.from({ length: 40 }, () => 1000);
    const keepThin = offSessionSignalKeeper(timesTs, vols);
    expect(keepThin(timesTs[30])).toBe(false);

    vols[30] = 2000; // 2× the 20-bar average
    const keepImpulse = offSessionSignalKeeper(timesTs, vols);
    expect(keepImpulse(timesTs[30])).toBe(true);
  });

  it('keeps every regular-session signal regardless of volume', () => {
    const timesTs = makeTimes(40, REGULAR_BASE);
    const vols = Array.from({ length: 40 }, () => 1000);
    const keepRegular = offSessionSignalKeeper(timesTs, vols);
    expect(keepRegular(timesTs[30])).toBe(true);
  });
  it('never drops a signal on day bars, whose timestamp says nothing about the session', () => {
    // A US day bar stamped 04:00 UTC would read as overnight on the intraday clock.
    const day = Date.parse('2026-06-02T04:00:00.000Z') / 1000;
    const timesTs = Array.from({ length: 40 }, (_, i) => day + i * 86400);
    const vols = Array.from({ length: 40 }, () => 1000);
    expect(offSessionSignalKeeper(timesTs, vols, 'day')(timesTs[30])).toBe(true);
  });

  it('reads a Hong Kong bar on the Hong Kong clock', () => {
    // 10:00 Hong Kong time on a Tuesday, which is overnight on the US clock.
    const hk = Date.parse('2026-06-02T02:00:00.000Z') / 1000;
    const timesTs = makeTimes(40, hk - 30 * STEP);
    const vols = Array.from({ length: 40 }, () => 1000);
    expect(offSessionSignalKeeper(timesTs, vols, 'm5', 'HK')(timesTs[30])).toBe(true);
    expect(offSessionSignalKeeper(timesTs, vols, 'm5', 'US')(timesTs[30])).toBe(false);
  });
});
