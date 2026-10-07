// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartGridState } from './chartGridState';

const openPalette = vi.fn();
vi.mock('../../palette/usePalette', () => ({ openPalette: (q: string) => openPalette(q) }));
vi.mock('./controlsContext', () => ({
  useIntradayControls: () => ({ visibleTfs: ['m5', 'm15', 'h1', '4h'] }),
}));

const { ChartShortcuts, readChartShortcut, stepTf } = await import('./chartShortcuts');

const key = (init: Partial<KeyboardEvent>) =>
  ({ key: '', code: '', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...init }) as KeyboardEvent;

describe('readChartShortcut', () => {
  it('reads Alt+1..4 as layouts, by key position', () => {
    expect(readChartShortcut(key({ code: 'Digit1', key: '1', altKey: true }))).toEqual({ kind: 'layout', layout: '1' });
    expect(readChartShortcut(key({ code: 'Digit4', key: '¢', altKey: true }))).toEqual({ kind: 'layout', layout: '4' });
    expect(readChartShortcut(key({ code: 'Digit5', key: '5', altKey: true }))).toBeNull();
  });

  it('reads [ and ] as stepping the timeframe, and Alt+Enter as enlarge', () => {
    expect(readChartShortcut(key({ key: '[' }))).toEqual({ kind: 'tf', step: -1 });
    expect(readChartShortcut(key({ key: ']', repeat: true }))).toEqual({ kind: 'tf', step: 1 });
    expect(readChartShortcut(key({ key: 'Enter', altKey: true }))).toEqual({ kind: 'enlarge' });
  });

  it('reads a typed letter or digit as the start of a ticker', () => {
    expect(readChartShortcut(key({ key: 'a' }))).toEqual({ kind: 'search', text: 'A' });
    expect(readChartShortcut(key({ key: 'N', shiftKey: true }))).toEqual({ kind: 'search', text: 'N' });
    expect(readChartShortcut(key({ key: '7' }))).toEqual({ kind: 'search', text: '7' });
  });

  it('leaves everything else alone', () => {
    expect(readChartShortcut(key({ key: 'c', ctrlKey: true }))).toBeNull();
    expect(readChartShortcut(key({ key: 'a', repeat: true }))).toBeNull();
    expect(readChartShortcut(key({ key: 'Escape' }))).toBeNull();
    expect(readChartShortcut(key({ key: 'Delete' }))).toBeNull();
  });
});

describe('stepTf', () => {
  it('moves along the shown timeframes and stops at the ends', () => {
    expect(stepTf(['m5', 'h1', 'day'], 'h1', 1)).toBe('day');
    expect(stepTf(['m5', 'h1', 'day'], 'day', 1)).toBe('day');
    expect(stepTf(['m5', 'h1', 'day'], 'm5', -1)).toBe('m5');
  });

  it("steps from a chart's own period even when the toolbar hides it", () => {
    expect(stepTf(['m5', 'h1', 'day'], 'week', -1)).toBe('day');
    expect(stepTf(['m5', 'h1', 'day'], '4h', -1)).toBe('h1');
  });
});

function grid(over: Partial<ChartGridState> = {}): ChartGridState {
  return {
    layout: '4',
    tfs: ['week', 'day', '4h', 'h1'],
    activeCell: 2,
    tf: '4h',
    setLayout: vi.fn(),
    setTf: vi.fn(),
    toggleMaximize: vi.fn(),
    ...over,
  } as unknown as ChartGridState;
}

describe('ChartShortcuts', () => {
  afterEach(() => {
    cleanup();
    openPalette.mockClear();
  });

  const press = (init: KeyboardEventInit, target: Element = document.body) =>
    fireEvent.keyDown(target, init);

  it('drives the grid from the keyboard', () => {
    const g = grid();
    render(
      <div style={{ width: 100 }}>
        <ChartShortcuts grid={g} />
      </div>,
    );
    // jsdom has no layout: say the page is on screen.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 100 });
    press({ key: '2', code: 'Digit2', altKey: true });
    expect(g.setLayout).toHaveBeenCalledWith('2h');
    press({ key: '[' });
    expect(g.setTf).toHaveBeenCalledWith('h1');
    press({ key: 'Enter', altKey: true });
    expect(g.toggleMaximize).toHaveBeenCalledWith(2);
    press({ key: 'n' });
    expect(openPalette).toHaveBeenCalledWith('N');
  });

  it('stays out of the way while typing, or when its page is hidden', () => {
    const g = grid();
    render(
      <div>
        <input aria-label="note" />
        <ChartShortcuts grid={g} />
      </div>,
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 100 });
    press({ key: 'n' }, document.querySelector('input')!);
    expect(openPalette).not.toHaveBeenCalled();

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 0 });
    press({ key: 'n' });
    expect(openPalette).not.toHaveBeenCalled();
  });

  it('does not enlarge a single chart', () => {
    const g = grid({ layout: '1', tfs: [], activeCell: 0 });
    render(
      <div>
        <ChartShortcuts grid={g} />
      </div>,
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 100 });
    press({ key: 'Enter', altKey: true });
    expect(g.toggleMaximize).not.toHaveBeenCalled();
  });
});
