import { describe, expect, it } from 'vitest';
import { usEarlyCloses, usMarketHolidays } from '../src/marketdata/usHolidays.js';
import { classifySession } from '../src/marketdata/session.js';

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('NYSE holiday calendar', () => {
  it('matches the published 2025 closures', () => {
    expect([...usMarketHolidays(2025)].sort()).toEqual([
      '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
      '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
    ]);
  });

  it('matches the published 2026 closures (Independence Day observed on Friday 3 July)', () => {
    expect([...usMarketHolidays(2026)].sort()).toEqual([
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
      '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    ]);
  });

  it('matches the published 2027 closures (Juneteenth and Christmas fall on weekends)', () => {
    expect([...usMarketHolidays(2027)].sort()).toEqual([
      '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
      '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
    ]);
  });

  it('lists the 13:00 early closes that fall on trading days', () => {
    expect([...usEarlyCloses(2025)].sort()).toEqual(['2025-07-03', '2025-11-28', '2025-12-24']);
    // 2026: 3 July is itself the observed holiday, so only two early closes.
    expect([...usEarlyCloses(2026)].sort()).toEqual(['2026-11-27', '2026-12-24']);
  });

  it('treats a holiday as closed all day and ends an early-close session at 13:00', () => {
    expect(classifySession(sec('2026-11-26T15:00:00Z'))).toBe('overnight'); // Thanksgiving 10:00 ET
    expect(classifySession(sec('2026-11-27T17:30:00Z'))).toBe('regular'); // 12:30 ET
    expect(classifySession(sec('2026-11-27T18:30:00Z'))).toBe('post'); // 13:30 ET
    expect(classifySession(sec('2026-11-27T15:00:00Z'), 'HK')).toBe('overnight'); // HK unaffected
  });
});
