import { describe, expect, it } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';
import {
  fetchAnalysisBars,
  sanitizeReassessTimeframes,
} from '../src/ai/agents/analysisTimeframes.js';

describe('sanitizeReassessTimeframes', () => {
  it('defaults to 5m / 15m / 1h', () => {
    expect(sanitizeReassessTimeframes(undefined)).toEqual(['m5', 'm15', 'h1']);
    expect(sanitizeReassessTimeframes([])).toEqual(['m5', 'm15', 'h1']);
  });

  it('keeps 1h / 4h / daily in chart order and drops extras', () => {
    expect(sanitizeReassessTimeframes(['day', 'h1', '4h', 'week'])).toEqual(['h1', '4h', 'day']);
  });
});

describe('fetchAnalysisBars', () => {
  it('aggregates 1h bars into 4h', async () => {
    const start = Date.parse('2026-07-02T13:30:00Z');
    const hourly: RawBar[] = Array.from({ length: 8 }, (_, i) => ({
      time: new Date(start + i * 60 * 60_000).toISOString(),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100.5 + i,
      volume: 10,
    }));
    const bars = await fetchAnalysisBars(async () => hourly, 'MU.US', '4h', 60);
    expect(bars.length).toBe(2);
    expect(bars[0].open).toBe(100);
    expect(bars[0].close).toBe(103.5);
  });
});
