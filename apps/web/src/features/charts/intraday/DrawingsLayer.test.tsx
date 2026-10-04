// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawingsHandle } from '../drawings/useDrawings';

const setActiveTool = vi.fn();
const clearSelection = vi.fn();

vi.mock('../drawings/useDrawings', () => ({
  useDrawings: () => ({ setActiveTool, clearSelection }),
}));
vi.mock('../drawings/DrawingToolbar', () => ({
  DrawingToolbar: () => <div data-testid="drawing-toolbar" />,
}));

const { DrawingsLayer } = await import('./DrawingsLayer');

const handle = {} as DrawingsHandle;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DrawingsLayer', () => {
  it('shows the toolbar and leaves the tool alone on the selected chart', () => {
    const { queryByTestId } = render(<DrawingsLayer symbol="NVDA.US" handle={handle} barTimes={[]} />);
    expect(queryByTestId('drawing-toolbar')).not.toBeNull();
    expect(setActiveTool).not.toHaveBeenCalled();
  });

  it('disarms the tool and drops the selection when the chart loses its toolbar', () => {
    const { queryByTestId, rerender } = render(
      <DrawingsLayer symbol="NVDA.US" handle={handle} barTimes={[]} />,
    );
    rerender(<DrawingsLayer symbol="NVDA.US" handle={handle} barTimes={[]} toolbar={false} />);
    expect(queryByTestId('drawing-toolbar')).toBeNull();
    expect(setActiveTool).toHaveBeenCalledWith('cursor');
    expect(clearSelection).toHaveBeenCalled();
  });
});
