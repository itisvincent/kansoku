import { describe, expect, it } from 'vitest';
import { buildTimelineItems } from './DateTimeline.js';

describe('buildTimelineItems', () => {
  it('uses English months and keeps year boundaries explicit', () => {
    const dates = ['2025-12-31', '2026-01-01', '2026-01-02', '2026-02-01'];
    expect(buildTimelineItems(dates, 'en-US').map((item) => item.monthLabel)).toEqual([
      'Dec 2025',
      'Jan',
      null,
      'Feb',
    ]);
    expect(buildTimelineItems(dates, 'en-US').map((item) => item.date)).toEqual(dates);
  });
  it('labels the first item and month changes only', () => {
    const items = buildTimelineItems(['2026-06-30', '2026-07-01', '2026-07-02']);
    expect(items.map((i) => i.monthLabel)).toEqual(['6月', '7月', null]);
  });

  it('strips leading zeros from day labels', () => {
    const items = buildTimelineItems(['2026-07-06', '2026-07-14']);
    expect(items.map((i) => i.day)).toEqual(['6', '14']);
  });

  it('includes the year when it differs from the newest date', () => {
    const items = buildTimelineItems(['2025-12-30', '2026-01-02']);
    expect(items.map((i) => i.monthLabel)).toEqual(['2025年12月', '1月']);
  });

  it('handles an empty list', () => {
    expect(buildTimelineItems([])).toEqual([]);
  });
});
