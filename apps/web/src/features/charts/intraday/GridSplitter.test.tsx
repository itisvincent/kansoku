// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GridSplitter } from './GridSplitter';

afterEach(cleanup);

/** A 1000 x 800 grid at the page origin. */
function containerRef() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }) as DOMRect;
  return { current: el };
}

function setup(axis: 'col' | 'row' = 'col', value = 0.5) {
  const onDraft = vi.fn();
  const onCommit = vi.fn();
  const { getByRole } = render(
    <GridSplitter
      axis={axis}
      value={value}
      containerRef={containerRef()}
      onDraft={onDraft}
      onCommit={onCommit}
    />,
  );
  return { splitter: getByRole('separator'), onDraft, onCommit };
}

describe('GridSplitter', () => {
  it('follows the pointer while dragged and saves where it is let go', () => {
    const { splitter, onDraft, onCommit } = setup();
    fireEvent.pointerDown(splitter, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 650, pointerId: 1 });
    expect(onDraft).toHaveBeenLastCalledWith(0.65);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onDraft).toHaveBeenLastCalledWith(null);
    expect(onCommit).toHaveBeenCalledWith(0.65);
  });

  it('leaves every chart its minimum size', () => {
    const { splitter, onCommit } = setup();
    fireEvent.pointerDown(splitter, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(0.18);
  });

  it('resizes rows with vertical moves', () => {
    const { splitter, onCommit } = setup('row');
    expect(splitter.getAttribute('aria-orientation')).toBe('horizontal');
    fireEvent.pointerDown(splitter, { button: 0, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(0.25);
  });

  it('ignores another pointer while dragging', () => {
    const { splitter, onDraft } = setup();
    fireEvent.pointerDown(splitter, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 700, pointerId: 2 });
    expect(onDraft).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 1 });
  });

  it('evens the split on double-click', () => {
    const { splitter, onCommit } = setup('col', 0.7);
    fireEvent.doubleClick(splitter);
    expect(onCommit).toHaveBeenCalledWith(0.5);
  });

  it('moves with the arrow keys and evens out with Home', () => {
    const { splitter, onCommit } = setup('col', 0.5);
    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith(0.52);
    fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenLastCalledWith(0.48);
    fireEvent.keyDown(splitter, { key: 'Home' });
    expect(onCommit).toHaveBeenLastCalledWith(0.5);
  });
});
