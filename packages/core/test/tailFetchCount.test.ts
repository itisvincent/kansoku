import { describe, expect, it } from 'vitest';
import { tailFetchCount } from '../src/realtime/charts.js';

const M5 = 5 * 60_000;

describe('tailFetchCount', () => {
  it('never asks for fewer bars than the chart builder accepts', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(now, now)).toBe(60);
    expect(tailFetchCount(now - 30 * 60_000, now)).toBe(60);
  });

  it('grows with elapsed time at m5 granularity once past the floor', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(now - 6 * 60 * 60_000, now)).toBe(72 + 5);
  });

  it('caps at the full fetch count after long idling', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(0, now)).toBe(1000);
    expect(tailFetchCount(now - 1000 * M5, now)).toBe(1000);
  });

  it('respects an enlarged full count for history views', () => {
    const now = 1_000_000_000;
    expect(tailFetchCount(0, now, 2000)).toBe(2000);
    expect(tailFetchCount(now, now, 2000)).toBe(60);
  });
});
