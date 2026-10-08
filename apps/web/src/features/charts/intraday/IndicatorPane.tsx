import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
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

/** What a pane below can ask of this one: room to grow into. */
export interface PaneControl {
  visible: () => boolean;
  /** The height on screen, which can be less than the set height in a short chart. */
  height: () => number;
  minHeight: number;
  resize: (height: number) => void;
  save: () => void;
}

/**
 * Where a drag of this pane's handle gets its room from: the main chart first, then the pane
 * just above. Without the pane above, a short chart (a grid cell, where the main chart already
 * sits at its minimum) left the lower pane no room at all, so it could not be resized.
 */
interface DragRoom {
  start: number;
  max: number;
  mainRoom: number;
  above: PaneControl | null;
  aboveStart: number;
  /** Whether the drag took any room from the pane above, so its new height is saved too. */
  tookFromAbove: boolean;
}

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
  control,
  abovePane,
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
  /** Lets the pane below take room from this one. */
  control?: Ref<PaneControl>;
  /** The indicator pane just above this one, to take room from once the main chart has none. */
  abovePane?: RefObject<PaneControl | null>;
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

  useImperativeHandle(
    control,
    () => ({
      visible: () => visible,
      height: currentHeight,
      minHeight,
      resize: update,
      save: persist,
    }),
  );

  const mainRoom = () => {
    const mainHeight = mainRef.current?.clientHeight ?? 0;
    if (mainHeight <= 0) return MAX_HEIGHT;
    const columnHeight = mainRef.current?.parentElement?.clientHeight ?? 0;
    const mainMin =
      columnHeight > 0
        ? Math.min(MAIN_CHART_MIN_HEIGHT, columnHeight * 0.3)
        : MAIN_CHART_MIN_HEIGHT;
    return Math.max(0, mainHeight - mainMin);
  };
  // Start from what is on screen: in a short chart the panes are squeezed below their set
  // heights, and resizing from the set height made the first part of a drag do nothing.
  const measureRoom = (): DragRoom => {
    const start = currentHeight();
    const room = mainRoom();
    const above = abovePane?.current?.visible() ? abovePane.current : null;
    const aboveStart = above ? above.height() : 0;
    const aboveRoom = above ? Math.max(0, aboveStart - above.minHeight) : 0;
    update(start);
    return {
      start,
      max: clamp(start + room + aboveRoom),
      mainRoom: room,
      above,
      aboveStart,
      tookFromAbove: false,
    };
  };
  /** Sets this pane's height, taking whatever the main chart cannot give from the pane above. */
  const resizeWithin = (room: DragRoom, next: number) => {
    const height = clamp(next, room.max);
    update(height);
    if (room.above) {
      const taken = Math.max(0, height - room.start - room.mainRoom);
      if (taken > 0) room.tookFromAbove = true;
      if (room.tookFromAbove) room.above.resize(room.aboveStart - taken);
    }
  };
  const saveAll = (room: DragRoom) => {
    persist();
    if (room.tookFromAbove) room.above?.save();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopDragRef.current?.();
    event.currentTarget.focus();
    const startY = event.clientY;
    const room = measureRoom();
    const pointerId = event.pointerId;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    setDragging(true);

    const onMove = (move: globalThis.PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      resizeWithin(room, room.start + startY - move.clientY);
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
      saveAll(room);
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
    const step =
      event.key === 'ArrowUp'
        ? 16
        : event.key === 'ArrowDown'
          ? -16
          : event.key === 'Home'
            ? -Infinity
            : event.key === 'End'
              ? Infinity
              : null;
    if (step === null) return;
    event.preventDefault();
    const room = measureRoom();
    resizeWithin(room, Number.isFinite(step) ? room.start + step : step > 0 ? room.max : minHeight);
    saveAll(room);
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
            const room = measureRoom();
            resizeWithin(room, defaultHeight);
            saveAll(room);
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
