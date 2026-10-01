/**
 * NYSE / Nasdaq trading calendar, computed from the exchange's published rules so it
 * never goes stale. Dates are New York calendar dates (YYYY-MM-DD).
 *
 * Full closures: New Year's Day, Martin Luther King Jr. Day, Presidents' Day, Good
 * Friday, Memorial Day, Juneteenth (from 2022), Independence Day, Labor Day,
 * Thanksgiving, Christmas. A Saturday holiday is observed the Friday before (except New
 * Year's Day, which is then not observed), a Sunday holiday the Monday after.
 * Early closes (13:00): the day before Independence Day, the day after Thanksgiving and
 * Christmas Eve, when those are regular weekdays.
 * One-off closures (national days of mourning, storms) are not predictable and are not
 * listed.
 */

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 0 = Sunday … 6 = Saturday, for a calendar date (no time zone involved). */
function weekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nthWeekday(year: number, month: number, dow: number, n: number): number {
  const first = weekday(year, month, 1);
  return 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
}

function lastWeekday(year: number, month: number, dow: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekday(year, month, lastDay);
  return lastDay - ((last - dow + 7) % 7);
}

/** Easter Sunday (Anonymous Gregorian algorithm). */
function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function shiftDays(year: number, month: number, day: number, by: number): string {
  const d = new Date(Date.UTC(year, month - 1, day + by));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** A fixed-date holiday moved to the weekday it is observed on, or null. */
function observed(year: number, month: number, day: number, saturdayToFriday = true): string | null {
  const dow = weekday(year, month, day);
  if (dow === 6) return saturdayToFriday ? shiftDays(year, month, day, -1) : null;
  if (dow === 0) return shiftDays(year, month, day, 1);
  return iso(year, month, day);
}

const closedCache = new Map<number, Set<string>>();
const earlyCache = new Map<number, Set<string>>();

export function usMarketHolidays(year: number): Set<string> {
  const hit = closedCache.get(year);
  if (hit) return hit;
  const [em, ed] = easter(year);
  const days = [
    // New Year's Day on a Saturday is not moved back into the old year.
    observed(year, 1, 1, false),
    iso(year, 1, nthWeekday(year, 1, 1, 3)),
    iso(year, 2, nthWeekday(year, 2, 1, 3)),
    shiftDays(year, em, ed, -2),
    iso(year, 5, lastWeekday(year, 5, 1)),
    year >= 2022 ? observed(year, 6, 19) : null,
    observed(year, 7, 4),
    iso(year, 9, nthWeekday(year, 9, 1, 1)),
    iso(year, 11, nthWeekday(year, 11, 4, 4)),
    observed(year, 12, 25),
  ].filter((d): d is string => d !== null);
  const set = new Set(days);
  closedCache.set(year, set);
  return set;
}

export function usEarlyCloses(year: number): Set<string> {
  const hit = earlyCache.get(year);
  if (hit) return hit;
  const holidays = usMarketHolidays(year);
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const candidates = [iso(year, 7, 3), shiftDays(year, 11, thanksgiving, 1), iso(year, 12, 24)];
  const set = new Set(
    candidates.filter((d) => {
      const [y, m, day] = d.split('-').map(Number);
      const dow = weekday(y, m, day);
      return dow >= 1 && dow <= 5 && !holidays.has(d);
    }),
  );
  earlyCache.set(year, set);
  return set;
}

export function isUsMarketHoliday(date: string): boolean {
  return usMarketHolidays(Number(date.slice(0, 4))).has(date);
}

export function isUsEarlyClose(date: string): boolean {
  return usEarlyCloses(Number(date.slice(0, 4))).has(date);
}
