// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { MouseEventParams } from 'lightweight-charts';
import { syncCrosshair, type CrosshairPane } from './lw';

function fakePane(shown = true) {
  let listener: ((param: MouseEventParams) => void) | null = null;
  const chart = {
    subscribeCrosshairMove: vi.fn((fn: (param: MouseEventParams) => void) => {
      listener = fn;
    }),
    unsubscribeCrosshairMove: vi.fn(),
    setCrosshairPosition: vi.fn(),
    clearCrosshairPosition: vi.fn(),
    chartElement: () => ({ offsetWidth: shown ? 400 : 0, offsetHeight: shown ? 200 : 0 }),
  };
  const series = { dataByIndex: vi.fn(() => ({ time: 10, close: 5 })) };
  const pane = { chart, series } as unknown as CrosshairPane;
  const move = (param: Partial<MouseEventParams>) => listener?.(param as MouseEventParams);
  return { pane, chart, move };
}

const hover = { time: 10 as never, logical: 0 as never, sourceEvent: {} as never };

describe('syncCrosshair', () => {
  it('mirrors the crosshair onto the other panes', () => {
    const main = fakePane();
    const rsi = fakePane();
    syncCrosshair([main.pane, rsi.pane]);
    main.move(hover);
    expect(rsi.chart.setCrosshairPosition).toHaveBeenCalledWith(5, 10, rsi.pane.series);
  });

  it('skips a pane that is switched off', () => {
    const main = fakePane();
    const macd = fakePane(false);
    const rsi = fakePane();
    syncCrosshair([main.pane, macd.pane, rsi.pane]);
    main.move(hover);
    expect(macd.chart.setCrosshairPosition).not.toHaveBeenCalled();
    expect(rsi.chart.setCrosshairPosition).toHaveBeenCalledTimes(1);
  });

  it('keeps working after the chart library throws', () => {
    const main = fakePane();
    const rsi = fakePane();
    rsi.chart.setCrosshairPosition.mockImplementationOnce(() => {
      throw new Error('Value is null');
    });
    syncCrosshair([main.pane, rsi.pane]);
    expect(() => main.move(hover)).toThrow('Value is null');
    main.move(hover);
    expect(rsi.chart.setCrosshairPosition).toHaveBeenCalledTimes(2);
  });
});
