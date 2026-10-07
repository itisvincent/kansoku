// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogicalRange } from 'lightweight-charts';
import type { ChartTf } from './timeframes';
import type { GridPane } from './gridCrosshair';
import { linkGridScroll } from './gridScroll';

const DAY = 86_400;
const HOUR = 3600;

function fakePane(times: number[], tf: ChartTf, range: LogicalRange, shown = true) {
  let listener: ((range: LogicalRange | null) => void) | null = null;
  const element = document.createElement('div');
  let visible = range;
  const timeScale = {
    getVisibleLogicalRange: () => visible,
    setVisibleLogicalRange: vi.fn((next: LogicalRange) => {
      visible = next;
      listener?.(next);
    }),
    subscribeVisibleLogicalRangeChange: (fn: (range: LogicalRange | null) => void) => {
      listener = fn;
    },
    unsubscribeVisibleLogicalRangeChange: () => {
      listener = null;
    },
  };
  Object.defineProperty(element, 'offsetWidth', { value: shown ? 400 : 0 });
  Object.defineProperty(element, 'offsetHeight', { value: shown ? 200 : 0 });
  const chart = { timeScale: () => timeScale, chartElement: () => element };
  const pane = { chart, read: () => ({ times, tf }), linked: [] } as unknown as GridPane;
  /** The chart scrolled to `next`, by the user (after a wheel turn) or by the program. */
  const scroll = (next: LogicalRange, byUser = true) => {
    if (byUser) element.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    visible = next;
    listener?.(next);
  };
  return { pane, timeScale, scroll, element, subscribed: () => listener !== null };
}

const range = (from: number, to: number) => ({ from, to }) as LogicalRange;

describe('linkGridScroll', () => {
  // Ten days, and the hourly candles of the last three.
  const days = Array.from({ length: 10 }, (_, i) => i * DAY);
  const hours = Array.from(
    { length: 21 },
    (_, i) => (7 + Math.floor(i / 7)) * DAY + (13 + (i % 7)) * HOUR,
  );

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves the other charts to the same date, each keeping its own zoom', () => {
    const daily = fakePane(days, 'day', range(0, 9));
    const hourly = fakePane(hours, 'h1', range(5, 20));
    linkGridScroll([daily.pane, hourly.pane]);

    // The hourly chart scrolled back so its right edge is the first hour of day 8.
    hourly.scroll(range(-7, 7));
    const [next] = daily.timeScale.setVisibleLogicalRange.mock.calls[0];
    // Day 8 sits at the right edge of the daily chart too, 9 candles wide as before.
    expect(next.to).toBe(8);
    expect(next.to - next.from).toBe(9);
  });

  it('keeps the newest candle where it sits when the user zooms at the live edge', () => {
    const daily = fakePane(days, 'day', range(0, 9));
    const hourly = fakePane(hours, 'h1', range(0, 20));
    linkGridScroll([daily.pane, hourly.pane]);

    // The hourly chart zoomed so its newest candle sits in the middle.
    hourly.scroll(range(10, 30));
    const [next] = daily.timeScale.setVisibleLogicalRange.mock.calls[0];
    expect(next.from + (next.to - next.from) / 2).toBe(9);
  });

  it('ignores scrolling the program does (live updates, loading history)', () => {
    const daily = fakePane(days, 'day', range(0, 9));
    const hourly = fakePane(hours, 'h1', range(5, 20));
    linkGridScroll([daily.pane, hourly.pane]);
    hourly.scroll(range(6, 21), false);
    expect(daily.timeScale.setVisibleLogicalRange).not.toHaveBeenCalled();

    hourly.scroll(range(6, 21));
    vi.advanceTimersByTime(1_000);
    hourly.scroll(range(7, 22), false);
    expect(daily.timeScale.setVisibleLogicalRange).toHaveBeenCalledTimes(1);
  });

  it('does not bounce the move back, and skips hidden charts', () => {
    const daily = fakePane(days, 'day', range(0, 9));
    const hourly = fakePane(hours, 'h1', range(5, 20));
    const hidden = fakePane(days, 'day', range(0, 9), false);
    linkGridScroll([daily.pane, hourly.pane, hidden.pane]);
    daily.scroll(range(-2, 7));
    expect(hourly.timeScale.setVisibleLogicalRange).toHaveBeenCalledTimes(1);
    expect(daily.timeScale.setVisibleLogicalRange).not.toHaveBeenCalled();
    expect(hidden.timeScale.setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('shows the oldest candle when the date is before a chart starts', () => {
    const daily = fakePane(days, 'day', range(0, 9));
    const hourly = fakePane(hours, 'h1', range(5, 20));
    linkGridScroll([daily.pane, hourly.pane]);
    daily.scroll(range(-7, 2));
    const [next] = hourly.timeScale.setVisibleLogicalRange.mock.calls[0];
    expect(next.to).toBe(0);
  });

  it('stops following when unlinked', () => {
    const daily = fakePane(days, 'day', range(0, 9));
    const hourly = fakePane(hours, 'h1', range(5, 20));
    const stop = linkGridScroll([daily.pane, hourly.pane]);
    stop();
    expect(daily.subscribed()).toBe(false);
    hourly.scroll(range(-7, 7));
    expect(daily.timeScale.setVisibleLogicalRange).not.toHaveBeenCalled();
  });
});
