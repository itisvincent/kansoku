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
let mounts = 0;

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
      mounts += 1;
    }, []);
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
    swapCells: vi.fn(),
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
  mounts = 0;
});

/** jsdom has no DataTransfer; this keeps what the drag sets. */
function fakeTransfer() {
  const data = new Map<string, string>();
  return {
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: '',
    dropEffect: '',
  };
}

const headers = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.chart-grid-cell-header')];
const cells = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.chart-grid-cell')];

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

  it('swaps two charts when one is dragged by its title bar onto the other', () => {
    const grid = gridState('4', ['week', 'day', '4h', 'h1']);
    const { container } = render(<ChartGrid symbol="NVDA.US" built={built} grid={grid} />);
    const dataTransfer = fakeTransfer();
    fireEvent.dragStart(headers(container)[0], { dataTransfer });
    fireEvent.dragOver(cells(container)[2], { dataTransfer });
    expect(container.querySelector('.chart-grid-drop')).not.toBeNull();
    fireEvent.drop(cells(container)[2], { dataTransfer });
    expect(grid.swapCells).toHaveBeenCalledWith(0, 2);
    expect(container.querySelector('.chart-grid-drop')).toBeNull();
  });

  it('ignores a drop that is not one of its charts', () => {
    const grid = gridState('2h', ['day', 'h1']);
    const { container } = render(<ChartGrid symbol="NVDA.US" built={built} grid={grid} />);
    const file = fakeTransfer();
    file.setData('Files', '');
    fireEvent.dragOver(cells(container)[1], { dataTransfer: file });
    fireEvent.drop(cells(container)[1], { dataTransfer: file });
    expect(grid.swapCells).not.toHaveBeenCalled();
  });

  it('does not start a move from a button in the title bar', () => {
    const grid = gridState('2h', ['day', 'h1']);
    const { container } = render(<ChartGrid symbol="NVDA.US" built={built} grid={grid} />);
    const enlarge = container.querySelector<HTMLElement>('.chart-grid-enlarge')!;
    fireEvent.pointerDown(enlarge);
    const dataTransfer = fakeTransfer();
    fireEvent.dragStart(headers(container)[0], { dataTransfer });
    expect(dataTransfer.types).toEqual([]);
  });

  it('keeps each chart, with its zoom and drawings, when two trade places', () => {
    const { rerender } = render(
      <ChartGrid symbol="NVDA.US" built={built} grid={gridState('2h', ['day', 'h1'])} />,
    );
    expect(mounts).toBe(2);
    rerender(<ChartGrid symbol="NVDA.US" built={built} grid={gridState('2h', ['h1', 'day'])} />);
    expect(mounts).toBe(2);
  });

  it('offers no move while one chart is enlarged', () => {
    const grid = gridState('4', ['week', 'day', '4h', 'h1'], { maximized: 1, activeCell: 1 });
    const { container } = render(<ChartGrid symbol="NVDA.US" built={built} grid={grid} />);
    expect(headers(container).every((h) => h.getAttribute('draggable') === 'false')).toBe(true);
  });

  it('links every chart, and unlinks charts that leave the layout', () => {
    const four = gridState('4', ['week', 'day', '4h', 'h1']);
    const { rerender } = render(<ChartGrid symbol="NVDA.US" built={built} grid={four} />);
    expect(linked.at(-1)).toBe(4);
    rerender(<ChartGrid symbol="NVDA.US" built={built} grid={gridState('2h', ['week', 'day'])} />);
    expect(linked.at(-1)).toBe(2);
  });
});
