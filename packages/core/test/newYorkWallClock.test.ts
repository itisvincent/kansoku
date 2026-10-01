import { describe, expect, it } from 'vitest';
import { newYorkWallClockInstant } from '../src/events/sources/instants.js';

describe('newYorkWallClockInstant', () => {
  it('reads EDGAR acceptance digits as New York time in summer (UTC-4)', () => {
    expect(newYorkWallClockInstant('2026-08-20T16:30:12.000Z')).toBe('2026-08-20T20:30:12.000Z');
  });

  it('reads them as New York time in winter (UTC-5)', () => {
    expect(newYorkWallClockInstant('2026-01-15T07:05:00.000Z')).toBe('2026-01-15T12:05:00.000Z');
  });

  it('handles the days the clocks change', () => {
    // 2026-03-08: clocks jump forward at 02:00. 03:30 is EDT.
    expect(newYorkWallClockInstant('2026-03-08T03:30:00Z')).toBe('2026-03-08T07:30:00.000Z');
    // 2026-11-01: clocks fall back at 02:00. 12:00 is EST.
    expect(newYorkWallClockInstant('2026-11-01T12:00:00Z')).toBe('2026-11-01T17:00:00.000Z');
  });

  it('returns null for text that is not a timestamp', () => {
    expect(newYorkWallClockInstant('not a date')).toBeNull();
  });
});
