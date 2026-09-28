// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clampRect, defaultRect, useFloatingRect } from './useFloatingRect';

const VW = 1440;
const VH = 900;

describe('clampRect', () => {
  it('keeps a rect that already fits untouched', () => {
    const rect = { x: 900, y: 300, w: 420, h: 460 };
    expect(clampRect(rect, VW, VH)).toEqual(rect);
  });

  it('pulls a rect dragged off the right edge back until 100px stays visible', () => {
    const { x } = clampRect({ x: 5000, y: 300, w: 420, h: 460 }, VW, VH);
    expect(x).toBe(VW - 100);
  });

  it('pulls a rect dragged off the left edge back until 100px stays visible', () => {
    const { x } = clampRect({ x: -5000, y: 300, w: 420, h: 460 }, VW, VH);
    expect(x).toBe(100 - 420);
  });

  it('never lets the header scroll above the top edge', () => {
    expect(clampRect({ x: 900, y: -300, w: 420, h: 460 }, VW, VH).y).toBe(0);
  });

  it('keeps the header reachable when dragged past the bottom edge', () => {
    expect(clampRect({ x: 900, y: 5000, w: 420, h: 460 }, VW, VH).y).toBe(VH - 100);
  });

  it('clamps the size between the minimum and the viewport', () => {
    const tiny = clampRect({ x: 100, y: 100, w: 10, h: 10 }, VW, VH);
    expect(tiny.w).toBe(320);
    expect(tiny.h).toBe(240);

    const huge = clampRect({ x: 0, y: 0, w: 9000, h: 9000 }, VW, VH);
    expect(huge.w).toBe(VW - 32);
    expect(huge.h).toBe(VH - 32);
  });

  it('survives a viewport smaller than the minimum size', () => {
    const rect = clampRect({ x: 0, y: 0, w: 420, h: 460 }, 200, 180);
    expect(rect.w).toBe(320);
    expect(rect.h).toBe(240);
    expect(Number.isFinite(rect.x)).toBe(true);
    expect(Number.isFinite(rect.y)).toBe(true);
  });
});

describe('defaultRect', () => {
  it('parks the panel in the bottom-right corner', () => {
    const rect = defaultRect(VW, VH);
    expect(rect.x + rect.w).toBe(VW - 16);
    expect(rect.y + rect.h).toBe(VH - 16);
  });

  it('shrinks to fit a viewport narrower than the default width', () => {
    const rect = defaultRect(360, VH);
    expect(rect.w).toBe(328);
    expect(rect.x + rect.w).toBe(360 - 16);
  });
});

describe('clampRect below the desktop tab bar', () => {
  it('keeps the header below a 40px tab bar', () => {
    expect(clampRect({ x: 900, y: 0, w: 420, h: 460 }, VW, VH, 40).y).toBe(40);
  });

  it('caps the height to the space under the tab bar', () => {
    expect(clampRect({ x: 0, y: 40, w: 420, h: 9000 }, VW, VH, 40).h).toBe(VH - 40 - 32);
  });
});

describe('useFloatingRect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  function mountTabBar() {
    const bar = document.createElement('div');
    bar.className = 'desktop-titlebar';
    bar.getBoundingClientRect = () => ({ bottom: 40 }) as DOMRect;
    document.body.append(bar);
  }

  it('pulls a panel saved under the tab bar back down on load', () => {
    mountTabBar();
    localStorage.setItem('chat-panel-rect', JSON.stringify({ x: 500, y: 0, w: 600, h: 900 }));
    const { result } = renderHook(() => useFloatingRect());
    expect(result.current.rect.y).toBeGreaterThanOrEqual(40);
  });

  it('ends a drag the OS cancelled instead of staying stuck', () => {
    const { result } = renderHook(() => useFloatingRect());
    act(() => {
      result.current.onDragStart({
        preventDefault: () => {},
        clientX: 10,
        clientY: 10,
      } as unknown as React.PointerEvent);
    });
    expect(result.current.dragging).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('pointercancel'));
    });
    expect(result.current.dragging).toBe(false);
  });

  it('ends a drag when the window loses focus mid-drag', () => {
    const { result } = renderHook(() => useFloatingRect());
    act(() => {
      result.current.onDragStart({
        preventDefault: () => {},
        clientX: 10,
        clientY: 10,
      } as unknown as React.PointerEvent);
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current.dragging).toBe(false);
  });
});
