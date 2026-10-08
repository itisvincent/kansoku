// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IndicatorPane, type PaneControl } from './IndicatorPane';

// jsdom has no layout: each block reports the height the test gives it.
const heights = new Map<string, number>();
const COLUMN = 400;

function setHeights(main: number, macd: number, rsi: number) {
  heights.set('main', main);
  heights.set('macd', macd);
  heights.set('rsi', rsi);
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.block ? (heights.get(this.dataset.block) ?? 0) : COLUMN;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const pane = this.querySelector<HTMLElement>('[data-block]') ?? this;
    const h = heights.get(pane.dataset.block ?? '') ?? 0;
    return { height: h, width: 300, top: 0, left: 0, right: 300, bottom: h, x: 0, y: 0, toJSON: () => ({}) };
  };
});

afterEach(cleanup);

function Column() {
  const mainRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<PaneControl>(null);
  return (
    <div>
      <div ref={mainRef} data-block="main" />
      <IndicatorPane
        visible
        defaultHeight={190}
        minHeight={100}
        storageKey="macd-h"
        label="Resize MACD"
        help=""
        mainRef={mainRef}
        className="macd"
        control={macdRef}
      >
        <div data-block="macd" />
      </IndicatorPane>
      <IndicatorPane
        visible
        defaultHeight={100}
        minHeight={80}
        storageKey="rsi-h"
        label="Resize RSI"
        help=""
        mainRef={mainRef}
        className="rsi"
        abovePane={macdRef}
      >
        <div data-block="rsi" />
      </IndicatorPane>
    </div>
  );
}

const basis = (label: string) => {
  const pane = screen.getByRole('separator', { name: label }).nextElementSibling as HTMLElement;
  return Number.parseFloat(pane.style.flex.split(' ')[2]);
};

function drag(label: string, dy: number) {
  const handle = screen.getByRole('separator', { name: label });
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 300 });
  fireEvent.pointerMove(window, { pointerId: 1, clientY: 300 + dy });
  fireEvent.pointerUp(window, { pointerId: 1, clientY: 300 + dy });
}

describe('IndicatorPane', () => {
  it('grows RSI out of the MACD pane when the main chart has no room to give', () => {
    // A small grid chart: the main chart is already at its minimum height.
    setHeights(120, 160, 90);
    render(<Column />);
    drag('Resize RSI', -50);
    expect(basis('Resize RSI')).toBe(140);
    expect(basis('Resize MACD')).toBe(110);
    expect(localStorage.getItem('rsi-h')).toBe('140');
    expect(localStorage.getItem('macd-h')).toBe('110');
  });

  it('takes space from the main chart first', () => {
    setHeights(150, 160, 90);
    render(<Column />);
    drag('Resize RSI', -50);
    expect(basis('Resize RSI')).toBe(140);
    // 30px came from the main chart (150 → 120), the other 20px from MACD.
    expect(basis('Resize MACD')).toBe(140);
  });

  it('stops when MACD reaches its minimum', () => {
    setHeights(120, 160, 90);
    render(<Column />);
    drag('Resize RSI', -200);
    expect(basis('Resize RSI')).toBe(150);
    expect(basis('Resize MACD')).toBe(100);
  });

  it('shrinks RSI from what is on screen, not from a size it was squeezed below', () => {
    setHeights(120, 160, 90);
    render(<Column />);
    // Its saved size is 100 but it shows at 90: dragging down 10px gives the minimum, 80.
    drag('Resize RSI', 10);
    expect(basis('Resize RSI')).toBe(80);
    // MACD was not touched: it keeps its own setting and nothing is saved for it.
    expect(basis('Resize MACD')).toBe(190);
    expect(localStorage.getItem('macd-h')).toBeNull();
  });
});
