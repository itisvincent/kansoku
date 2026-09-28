import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'chat-panel-rect';
const MIN_W = 320;
const MIN_H = 240;
const MARGIN = 16;
const KEEP_VISIBLE = 100;
const DEFAULT_W = 420;
const DEFAULT_H = 460;

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ResizeEdge = 'w' | 'n' | 'nw';

/**
 * `top` is the height of anything fixed above the page (the desktop tab bar). That strip is
 * an OS window-drag region that swallows the mouse, so the panel's header must never sit
 * under it or the panel can no longer be moved.
 */
export function clampRect(rect: FloatRect, vw: number, vh: number, top = 0): FloatRect {
  const w = Math.min(Math.max(rect.w, MIN_W), Math.max(MIN_W, vw - MARGIN * 2));
  const h = Math.min(Math.max(rect.h, MIN_H), Math.max(MIN_H, vh - top - MARGIN * 2));
  const minX = KEEP_VISIBLE - w;
  const maxX = Math.max(minX, vw - KEEP_VISIBLE);
  const maxY = Math.max(top, vh - KEEP_VISIBLE);
  return {
    w,
    h,
    x: Math.min(Math.max(rect.x, minX), maxX),
    y: Math.min(Math.max(rect.y, top), maxY),
  };
}

/** Bottom edge of the desktop tab bar, or 0 outside the desktop shell. */
export function topInset(): number {
  if (typeof document === 'undefined') return 0;
  const bar = document.querySelector('.desktop-titlebar');
  return bar ? Math.max(0, Math.ceil(bar.getBoundingClientRect().bottom)) : 0;
}

const clampToWindow = (rect: FloatRect): FloatRect =>
  clampRect(rect, window.innerWidth, window.innerHeight, topInset());

export function defaultRect(vw: number, vh: number): FloatRect {
  const w = Math.min(DEFAULT_W, Math.max(MIN_W, vw - MARGIN * 2));
  const h = Math.min(DEFAULT_H, Math.max(MIN_H, vh - MARGIN * 2));
  return clampRect({ x: vw - w - MARGIN, y: vh - h - MARGIN, w, h }, vw, vh);
}

function isRect(value: unknown): value is FloatRect {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return ['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

function loadRect(vw: number, vh: number): FloatRect {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRect(vw, vh);
    const parsed: unknown = JSON.parse(raw);
    return isRect(parsed) ? clampRect(parsed, vw, vh, topInset()) : defaultRect(vw, vh);
  } catch {
    return defaultRect(vw, vh);
  }
}

function saveRect(rect: FloatRect): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
  } catch {
    return;
  }
}

export interface FloatingRectHandle {
  rect: FloatRect;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (edge: ResizeEdge) => (e: React.PointerEvent) => void;
  dragging: boolean;
}

export function useFloatingRect(): FloatingRectHandle {
  const [rect, setRect] = useState<FloatRect>(() =>
    loadRect(window.innerWidth, window.innerHeight),
  );
  const [dragging, setDragging] = useState(false);
  const stopTrackingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // The tab bar may mount after the panel; re-clamp once it exists and on every resize.
    setRect((prev) => clampToWindow(prev));
    const onResize = () => setRect((prev) => clampToWindow(prev));
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      stopTrackingRef.current?.();
    };
  }, []);

  const track = useCallback(
    (compute: (dx: number, dy: number) => FloatRect, startX: number, startY: number) => {
      stopTrackingRef.current?.();
      setDragging(true);
      const onMove = (ev: PointerEvent) => {
        setRect(clampToWindow(compute(ev.clientX - startX, ev.clientY - startY)));
      };
      // pointercancel and window blur end a drag the OS interrupted (alt-tab, touch cancel),
      // which otherwise left the panel stuck in dragging mode.
      const stop = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', stop, true);
        window.removeEventListener('pointercancel', stop, true);
        window.removeEventListener('blur', stop);
        stopTrackingRef.current = null;
        setDragging(false);
        setRect((current) => {
          saveRect(current);
          return current;
        });
      };
      stopTrackingRef.current = stop;
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
      window.addEventListener('blur', stop);
    },
    [],
  );

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const start = rect;
      track((dx, dy) => ({ ...start, x: start.x + dx, y: start.y + dy }), e.clientX, e.clientY);
    },
    [rect, track],
  );

  const onResizeStart = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const start = rect;
      const right = start.x + start.w;
      const bottom = start.y + start.h;
      track(
        (dx, dy) => {
          const next = { ...start };
          if (edge === 'w' || edge === 'nw') {
            next.w = Math.max(MIN_W, start.w - dx);
            next.x = right - next.w;
          }
          if (edge === 'n' || edge === 'nw') {
            next.h = Math.max(MIN_H, start.h - dy);
            next.y = bottom - next.h;
          }
          return next;
        },
        e.clientX,
        e.clientY,
      );
    },
    [rect, track],
  );

  return { rect, onDragStart, onResizeStart, dragging };
}
