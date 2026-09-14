import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '../../../theme/tokens.stylex';

const MAX_HEIGHT = 340;
const MAIN_CHART_MIN_HEIGHT = 120;

const styles = stylex.create({
  pane: {
    minHeight: 0,
    overflow: 'hidden',
  },
  resizer: {
    'backgroundColor': colors.backgroundSurface,
    'cursor': 'row-resize',
    'flex': '0 0 8px',
    'position': 'relative',
    'touchAction': 'none',
    'zIndex': 11,
    '::after': {
      backgroundColor: colors.borderStrong,
      borderRadius: radii.default,
      content: '""',
      height: '2px',
      left: '50%',
      marginLeft: '-24px',
      position: 'absolute',
      top: '3px',
      width: '48px',
    },
    ':hover': { backgroundColor: colors.backgroundHover },
    ':hover::after': { backgroundColor: colors.accent },
    ':focus-visible': { outline: `1px solid ${colors.accent}`, outlineOffset: '-1px' },
  },
  dragging: {
    'backgroundColor': colors.backgroundHover,
    '::after': { backgroundColor: colors.accent },
  },
});

export function IndicatorPane({
  children,
  className,
  visible,
  defaultHeight,
  minHeight,
  storageKey,
  label,
  help,
  mainRef,
}: {
  children: ReactNode;
  className: string;
  visible: boolean;
  defaultHeight: number;
  minHeight: number;
  storageKey: string;
  label: string;
  help: string;
  mainRef: RefObject<HTMLDivElement | null>;
}) {
  const clamp = (value: number, max = MAX_HEIGHT) => Math.min(max, Math.max(minHeight, value));
  const [height, setHeight] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) return clamp(saved);
    } catch {
      // The pane remains resizable when storage is unavailable.
    }
    return defaultHeight;
  });
  const heightRef = useRef(height);
  const paneRef = useRef<HTMLDivElement>(null);
  const stopDragRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!visible) stopDragRef.current?.();
    return () => stopDragRef.current?.();
  }, [visible]);

  const persist = () => {
    try {
      localStorage.setItem(storageKey, String(Math.round(heightRef.current)));
    } catch {
      // Persisting a preference must not prevent resizing.
    }
  };
  const update = (next: number) => {
    heightRef.current = next;
    setHeight(next);
  };
  const currentHeight = () => paneRef.current?.getBoundingClientRect().height || heightRef.current;
  const availableMax = (current: number) => {
    const mainHeight = mainRef.current?.clientHeight ?? 0;
    const columnHeight = mainRef.current?.parentElement?.clientHeight ?? 0;
    const mainMin =
      columnHeight > 0
        ? Math.min(MAIN_CHART_MIN_HEIGHT, columnHeight * 0.3)
        : MAIN_CHART_MIN_HEIGHT;
    return mainHeight > 0 ? clamp(current + mainHeight - mainMin) : MAX_HEIGHT;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopDragRef.current?.();
    event.currentTarget.focus();
    const startY = event.clientY;
    const startHeight = currentHeight();
    const maxHeight = availableMax(startHeight);
    const pointerId = event.pointerId;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    setDragging(true);

    const onMove = (move: globalThis.PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      update(clamp(startHeight + startY - move.clientY, maxHeight));
    };
    const finish = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
      window.removeEventListener('blur', finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      stopDragRef.current = null;
      setDragging(false);
      persist();
    };
    const onEnd = (end: globalThis.PointerEvent) => {
      if (end.pointerId === pointerId) finish();
    };
    stopDragRef.current = finish;
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onEnd, true);
    window.addEventListener('pointercancel', onEnd, true);
    window.addEventListener('blur', finish);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = currentHeight();
    const max = availableMax(current);
    const next =
      event.key === 'ArrowUp'
        ? current + 16
        : event.key === 'ArrowDown'
          ? current - 16
          : event.key === 'Home'
            ? minHeight
            : event.key === 'End'
              ? max
              : null;
    if (next === null) return;
    event.preventDefault();
    update(clamp(next, max));
    persist();
  };

  return (
    <>
      {visible && (
        <div
          className={`pane-resizer ${stylex.props(styles.resizer, dragging && styles.dragging).className}`}
          role="separator"
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={minHeight}
          aria-valuemax={MAX_HEIGHT}
          aria-valuenow={Math.round(height)}
          tabIndex={0}
          title={help}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onDoubleClick={() => {
            update(clamp(defaultHeight, availableMax(currentHeight())));
            persist();
          }}
        />
      )}
      <div
        ref={paneRef}
        className={`${className} ${stylex.props(styles.pane).className}`}
        style={{
          flex: `0 1 ${height}px`,
          minHeight: visible ? `min(${minHeight}px, 25%)` : 0,
          display: visible ? undefined : 'none',
        }}
        aria-hidden={!visible}
      >
        {children}
      </div>
    </>
  );
}
