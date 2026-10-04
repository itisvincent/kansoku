// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';
import type { ChartGridState, GridLayout } from './chartGridState';
import type { ChartTf } from './timeframes';
import type { DrawingChartHandle } from './useIntradayCharts';

const chartProps: Array<{ activeTf: ChartTf; drawingToolbar?: boolean; compact?: boolean }> = [];
const linked: number[] = [];

vi.mock('./IntradayChartOnly', () => ({
  IntradayChartOnly: (props: {
    activeTf: ChartTf;
    drawingToolbar?: boolean;
    compact?: boolean;
    onChartHandle?: (handle: DrawingChartHandle | null) => void;
  }) => {
    chartProps.push(props);
    const { onChartHandle } = props;
    useEffect(() => {
      onChartHandle?.({ chart: {}, series: {}, container: {} } as unknown as DrawingChartHandle);
      return () => onChartHandle?.(null);
    }, [onChartHandle]);
    return <div data-testid={`chart-${props.activeTf}`} />;
  },
}));
vi.mock('./IntradayTimeframeSwitch', () => ({ IntradayTimeframeSwitch: () => null }));
vi.mock('./useViewTimeframe', () => ({
  useViewTimeframe: () => ({ tf: null, error: null, loading: false }),
}));
vi.mock('./gridCrosshair', () => ({
  linkGridCrosshairs: (panes: unknown[]) => {
    linked.push(panes.length);
    return () => {};
  },
}));

const { ChartGrid } = await import('./ChartGrid');

const built = { timeframes: { h1: { candles: [] } } } as unknown as IntradayBuilt;

function gridState(layout: GridLayout, tfs: ChartTf[], overrides: Partial<ChartGridState> = {}) {
  return {
    layout,
    setLayout: vi.fn(),
    tfs,
    activeCell: 0,
    selectCell: vi.fn(),
    setCellTf: vi.fn(),
    maximized: null,
    toggleMaximize: vi.fn(),
    tf: tfs[0],
    setTf: vi.fn(),
    ...overrides,
  } satisfies ChartGridState;
}

afterEach(() => {
  cleanup();
  chartProps.length = 0;
  linked.length = 0;
});

const lastPropsFor = (tf: ChartTf) => chartProps.filter((p) => p.activeTf === tf).at(-1);

describe('ChartGrid', () => {
  it('draws one compact chart per timeframe, with the toolbar on the selected one only', () => {
    const grid = gridState('4', ['week', 'day', '4h', 'h1'], { activeCell: 1 });
    const { getAllByRole } = render(<ChartGrid symbol="NVDA.US" built={built} grid={grid} />);
    expect(getAllByRole('region')).toHaveLength(4);
    expect(lastPropsFor('day')?.drawingToolbar).toBe(true);
    expect(lastPropsFor('week')?.drawingToolbar).toBe(false);
    expect(lastPropsFor('h1')?.compact).toBe(true);
  });

  it('selects a chart when it is clicked', () => {
    const grid = gridState('2h', ['day', 'h1']);
    const { getAllByRole } = render(<ChartGrid symbol="NVDA.US" built={built} grid={grid} />);
    fireEvent.pointerDown(getAllByRole('region')[1]);
    expect(grid.selectCell).toHaveBeenCalledWith(1);
  });

  it('hides the other charts while one is enlarged', () => {
    const grid = gridState('4', ['week', 'day', '4h', 'h1'], { maximized: 2, activeCell: 2 });
    const { container } = render(<ChartGrid symbol="NVDA.US" built={built} grid={grid} />);
    const hidden = container.querySelectorAll('.chart-grid-cell[aria-hidden="true"]');
    expect(hidden).toHaveLength(3);
  });

  it('links every chart, and unlinks charts that leave the layout', () => {
    const four = gridState('4', ['week', 'day', '4h', 'h1']);
    const { rerender } = render(<ChartGrid symbol="NVDA.US" built={built} grid={four} />);
    expect(linked.at(-1)).toBe(4);
    rerender(<ChartGrid symbol="NVDA.US" built={built} grid={gridState('2h', ['week', 'day'])} />);
    expect(linked.at(-1)).toBe(2);
  });
});
