import { describe, expect, it, vi } from 'vitest';
import type { MouseEventParams } from 'lightweight-charts';
import type { ChartTf } from './timeframes';
import { linkGridCrosshairs, type GridPane } from './gridCrosshair';

const HOUR = 3600;
const DAY = 86_400;

function fakePane(times: number[], tf: ChartTf, shown = true) {
  let listener: ((param: MouseEventParams) => void) | null = null;
  const chart = {
    subscribeCrosshairMove: vi.fn((fn: (param: MouseEventParams) => void) => {
      listener = fn;
    }),
    unsubscribeCrosshairMove: vi.fn(() => {
      listener = null;
    }),
    setCrosshairPosition: vi.fn(),
    clearCrosshairPosition: vi.fn(),
    chartElement: () => ({ offsetWidth: shown ? 400 : 0, offsetHeight: shown ? 200 : 0 }),
  };
  const series = {
    dataByIndex: vi.fn((i: number) => ({ time: times[i], close: 100 + i })),
  };
  const pane = {
    chart,
    series,
    read: () => ({ times, tf }),
  } as unknown as GridPane;
  const move = (param: Partial<MouseEventParams>) => listener?.(param as MouseEventParams);
  return { pane, chart, move, subscribed: () => listener !== null };
}

const userEvent = { sourceEvent: {} } as Partial<MouseEventParams>;

describe('linkGridCrosshairs', () => {
  const days = [0, DAY, 2 * DAY];
  const hours = [DAY + 14 * HOUR, DAY + 15 * HOUR, DAY + 16 * HOUR];

  it('marks the matching candle in the other charts', () => {
    const daily = fakePane(days, 'day');
    const hourly = fakePane(hours, 'h1');
    linkGridCrosshairs([daily.pane, hourly.pane]);

    hourly.move({ ...userEvent, time: hours[1] as never });
    expect(daily.chart.setCrosshairPosition).toHaveBeenCalledWith(101, DAY, daily.pane.series);

    daily.move({ ...userEvent, time: DAY as never });
    expect(hourly.chart.setCrosshairPosition).toHaveBeenCalledWith(102, hours[2], hourly.pane.series);
  });

  it('ignores the echo of a mark it placed', () => {
    const daily = fakePane(days, 'day');
    const hourly = fakePane(hours, 'h1');
    linkGridCrosshairs([daily.pane, hourly.pane]);
    daily.move({ time: DAY as never });
    expect(hourly.chart.setCrosshairPosition).not.toHaveBeenCalled();
  });

  it('clears its marks when the cursor leaves, but only from the chart that placed them', () => {
    const daily = fakePane(days, 'day');
    const hourly = fakePane(hours, 'h1');
    linkGridCrosshairs([daily.pane, hourly.pane]);
    hourly.move({ ...userEvent, time: hours[0] as never });
    daily.move({});
    expect(hourly.chart.clearCrosshairPosition).not.toHaveBeenCalled();
    hourly.move({});
    expect(daily.chart.clearCrosshairPosition).toHaveBeenCalledTimes(1);
  });

  it('clears a chart that has no candle at the hovered moment', () => {
    const daily = fakePane(days, 'day');
    const hourly = fakePane(hours, 'h1');
    linkGridCrosshairs([daily.pane, hourly.pane]);
    daily.move({ ...userEvent, time: 0 as never });
    expect(hourly.chart.clearCrosshairPosition).toHaveBeenCalledTimes(1);
    expect(hourly.chart.setCrosshairPosition).not.toHaveBeenCalled();
  });

  it('skips a chart hidden behind an enlarged one', () => {
    const daily = fakePane(days, 'day');
    const hourly = fakePane(hours, 'h1', false);
    linkGridCrosshairs([daily.pane, hourly.pane]);
    daily.move({ ...userEvent, time: DAY as never });
    hourly.move({});
    expect(hourly.chart.setCrosshairPosition).not.toHaveBeenCalled();
  });

  it('keeps working after the chart library throws', () => {
    const daily = fakePane(days, 'day');
    const hourly = fakePane(hours, 'h1');
    hourly.chart.setCrosshairPosition.mockImplementationOnce(() => {
      throw new Error('Value is null');
    });
    linkGridCrosshairs([daily.pane, hourly.pane]);
    expect(() => daily.move({ ...userEvent, time: DAY as never })).toThrow('Value is null');
    daily.move({ ...userEvent, time: DAY as never });
    expect(hourly.chart.setCrosshairPosition).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes every chart', () => {
    const daily = fakePane(days, 'day');
    const hourly = fakePane(hours, 'h1');
    const stop = linkGridCrosshairs([daily.pane, hourly.pane]);
    stop();
    expect(daily.subscribed()).toBe(false);
    expect(hourly.subscribed()).toBe(false);
  });
});
