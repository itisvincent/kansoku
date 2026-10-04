import { useEffect } from 'react';
import { DrawingToolbar } from '../drawings/DrawingToolbar';
import { useDrawings, type DrawingsHandle } from '../drawings/useDrawings';

export interface DrawingsLayerProps {
  symbol: string;
  handle: DrawingsHandle | null;
  barTimes: number[];
  /**
   * Without the toolbar (a grid chart that is not selected) the chart still shows the stock's
   * drawings, but holds no armed tool and no selection: with no toolbar there is no way to
   * disarm a tool, and a selection would make Delete remove drawings on two charts at once.
   */
  toolbar?: boolean;
}

export function DrawingsLayer({ symbol, handle, barTimes, toolbar = true }: DrawingsLayerProps) {
  const drawingsApi = useDrawings(handle, symbol, barTimes);
  const { setActiveTool, clearSelection } = drawingsApi;

  useEffect(() => {
    if (toolbar || !handle) return;
    setActiveTool('cursor');
    clearSelection();
  }, [toolbar, handle, symbol, setActiveTool, clearSelection]);

  return toolbar ? <DrawingToolbar api={drawingsApi} /> : null;
}
