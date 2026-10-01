// Calendars hand out plain dates for anything not scheduled to the minute. Midnight
// UTC is the tempting reading and the wrong one: on 2026-08-27T00:00:00Z a New York
// user sees the evening of the 26th, so a report lands a day early on the timeline of
// the market it belongs to. Noon Eastern is the same calendar day in both EDT
// (UTC-4) and EST (UTC-5), and reads as the placeholder it is rather than as a
// precise time somebody measured.
export const DATE_ONLY_HOUR_UTC = 16;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateOnlyInstant(date: string): string | null {
  const match = DATE_ONLY.exec(date.trim());
  if (!match) return null;
  const at = Date.parse(`${match[0]}T${String(DATE_ONLY_HOUR_UTC).padStart(2, '0')}:00:00.000Z`);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

const NEW_YORK_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** New York's offset from UTC at an instant, in ms (-4h in summer, -5h in winter). */
function newYorkOffsetMs(utcMs: number): number {
  const parts = NEW_YORK_PARTS.formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Reads the digits of a timestamp as New York wall-clock time, ignoring any zone suffix.
 * SEC EDGAR writes acceptanceDateTime this way: Eastern time with a literal ".000Z".
 */
export function newYorkWallClockInstant(text: string): string | null {
  const match = WALL_CLOCK.exec(text.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (!Number.isFinite(wall)) return null;
  // Two passes settle the offset, including on the days the clocks change.
  let utc = wall + 5 * 3600_000;
  for (let i = 0; i < 2; i++) utc = wall - newYorkOffsetMs(utc);
  return new Date(utc).toISOString();
}
