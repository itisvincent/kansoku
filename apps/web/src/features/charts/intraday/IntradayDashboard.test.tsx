// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';

vi.mock('@web/features/edition/capabilitiesStore', () => ({
  useCapabilities: () => ({ features: { 'auto-patterns': 'active', 'options-walls': 'active' } }),
}));

vi.mock('./useIntradayCharts', () => ({
  EMA_COLORS: ['#fff'],
  useIntradayCharts: vi.fn(),
}));

vi.mock('../drawings/useDrawings', () => ({
  useDrawings: () => ({}),
}));

vi.mock('../drawings/DrawingToolbar', () => ({
  DrawingToolbar: () => null,
}));

const { IntradayChartOnly } = await import('./IntradayDashboard');
const { IntradayControlsProvider } = await import('./controlsContext');
const { ChartLayerMenu } = await import('./ChartLayerMenu');

const built = {
  sidebar: { technicals: { m5: { emas: [{ period: 9, last: 588.39 }] } } },
  timeframes: { m5: { candles: [] } },
} as unknown as IntradayBuilt;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('IntradayChartOnly', () => {
  it('renders the EMA legend from the built technicals', () => {
    const { container } = render(
      <IntradayControlsProvider>
        <IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />
      </IntradayControlsProvider>,
    );

    expect(container.querySelector('.chart-legend')?.textContent).toContain('EMA9');
  });

  it('no longer floats the layer panel over the chart — it moved to the control bar', () => {
    const { container } = render(
      <IntradayControlsProvider>
        <IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />
      </IntradayControlsProvider>,
    );

    expect(container.querySelector('.layer-panel')).toBeNull();
  });
});

describe('IntradayChartOnly MACD height storage', () => {
  it('reads and writes the plain key when no namespace is given', () => {
    localStorage.setItem('intraday-macd-height', '250');
    const { container } = render(
      <IntradayControlsProvider>
        <IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />
      </IntradayControlsProvider>,
    );

    const macdBlock = container.querySelector('.chart-block.macd') as HTMLElement;
    expect(macdBlock.style.flexBasis).toBe('250px');
  });

  it('with a namespace, reads and writes only its own prefixed key', () => {
    localStorage.setItem('intraday-macd-height', '300');
    localStorage.setItem('trainer-intraday-macd-height', '200');
    const { container } = render(
      <IntradayControlsProvider storageNamespace="trainer">
        <IntradayChartOnly
          symbol="NVDA.US"
          built={built}
          activeTf="m5"
          storageNamespace="trainer"
        />
      </IntradayControlsProvider>,
    );

    const macdBlock = container.querySelector('.chart-block.macd') as HTMLElement;
    expect(macdBlock.style.flexBasis).toBe('200px');

    const resizer = container.querySelector('.pane-resizer') as HTMLElement;
    fireEvent.pointerDown(resizer, { clientY: 500 });
    fireEvent.pointerMove(window, { clientY: 440 });
    fireEvent.pointerUp(window);

    expect(localStorage.getItem('trainer-intraday-macd-height')).toBe('260');
    expect(localStorage.getItem('intraday-macd-height')).toBe('300');
  });
});

describe('indicator panes', () => {
  function renderChart(storageNamespace?: string) {
    return render(
      <IntradayControlsProvider storageNamespace={storageNamespace}>
        <ChartLayerMenu built={built} activeTf="m5" />
        <IntradayChartOnly
          symbol="NVDA.US"
          built={built}
          activeTf="m5"
          storageNamespace={storageNamespace}
          drawings={false}
        />
      </IntradayControlsProvider>,
    );
  }

  it('keeps MACD visible for existing preferences and saves hiding it through Custom layers', () => {
    localStorage.setItem('intraday-indicators', JSON.stringify({ rsi: true, ema: false }));
    const { container, unmount } = renderChart();
    const pane = container.querySelector('.chart-block.macd') as HTMLElement;
    const host = pane.querySelector('.chart-host');
    expect(pane.style.display).not.toBe('none');

    fireEvent.click(screen.getByText('自定义图层'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'MACD' }));
    expect(pane.style.display).toBe('none');
    expect(pane.querySelector('.chart-host')).toBe(host);
    expect(screen.queryByRole('separator', { name: '拖动调整 MACD 高度' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('intraday-indicators')!).macd).toBe(false);

    unmount();
    const restored = renderChart();
    expect(
      (restored.container.querySelector('.chart-block.macd') as HTMLElement).style.display,
    ).toBe('none');
    fireEvent.click(screen.getByText('自定义图层'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'MACD' }));
    expect(
      (restored.container.querySelector('.chart-block.macd') as HTMLElement).style.display,
    ).not.toBe('none');
    expect(screen.getByRole('separator', { name: '拖动调整 MACD 高度' })).toBeTruthy();
  });

  it('resizes RSI independently and restores its namespaced height after reopening', () => {
    localStorage.setItem('trainer-intraday-indicators', JSON.stringify({ rsi: true }));
    localStorage.setItem('trainer-intraday-rsi-height', '140');
    localStorage.setItem('intraday-rsi-height', '100');
    const { container, unmount } = renderChart('trainer');
    const pane = container.querySelector('.chart-block.rsi') as HTMLElement;
    expect(pane.style.flexBasis).toBe('140px');
    const divider = screen.getByRole('separator', { name: '拖动调整 RSI 高度' });
    fireEvent.pointerDown(divider, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 450, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(pane.style.flexBasis).toBe('190px');
    expect(localStorage.getItem('trainer-intraday-rsi-height')).toBe('190');
    expect(localStorage.getItem('intraday-rsi-height')).toBe('100');
    expect(localStorage.getItem('trainer-intraday-macd-height')).toBeNull();

    unmount();
    const restored = renderChart('trainer');
    expect(
      (restored.container.querySelector('.chart-block.rsi') as HTMLElement).style.flexBasis,
    ).toBe('190px');
  });

  it.each([
    { name: 'MACD', min: 100, initial: 190, key: 'intraday-macd-height' },
    { name: 'RSI', min: 80, initial: 100, key: 'intraday-rsi-height' },
  ])('supports keyboard sizing and double-click reset for $name', ({ name, min, initial, key }) => {
    localStorage.setItem('intraday-indicators', JSON.stringify({ rsi: true }));
    renderChart();
    const divider = screen.getByRole('separator', { name: `拖动调整 ${name} 高度` });
    fireEvent.keyDown(divider, { key: 'ArrowUp' });
    expect(divider.getAttribute('aria-valuenow')).toBe(String(initial + 16));
    fireEvent.keyDown(divider, { key: 'ArrowDown' });
    expect(localStorage.getItem(key)).toBe(String(initial));
    fireEvent.keyDown(divider, { key: 'End' });
    expect(localStorage.getItem(key)).toBe('340');
    fireEvent.keyDown(divider, { key: 'Home' });
    fireEvent.keyDown(divider, { key: 'ArrowDown' });
    expect(localStorage.getItem(key)).toBe(String(min));
    fireEvent.doubleClick(divider);
    expect(localStorage.getItem(key)).toBe(String(initial));
  });

  it('leaves room for the price chart and cleans up a cancelled resize', () => {
    const { container } = renderChart();
    const main = container.querySelector('.chart-block')!;
    Object.defineProperty(main, 'clientHeight', { value: 150 });
    const divider = screen.getByRole('separator', { name: '拖动调整 MACD 高度' });
    fireEvent.pointerDown(divider, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 100, pointerId: 2 });
    expect(divider.getAttribute('aria-valuenow')).toBe('190');
    fireEvent.pointerMove(window, { clientY: 100, pointerId: 1 });
    expect(divider.getAttribute('aria-valuenow')).toBe('220');
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    fireEvent.pointerMove(window, { clientY: 600, pointerId: 1 });
    expect(localStorage.getItem('intraday-macd-height')).toBe('220');
    expect(divider.getAttribute('aria-valuenow')).toBe('220');
  });
});
