import { useLocale } from '@web/lib/i18n';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../../../theme/tokens.stylex';
import { splitBounds, type SplitAxis } from './chartGridState';

const KEY_STEP = 0.02;

const styles = stylex.create({
  splitter: {
    'position': 'absolute',
    'touchAction': 'none',
    'zIndex': 40,
    '::after': {
      backgroundColor: 'transparent',
      content: '""',
      position: 'absolute',
      transition: 'background-color 0.12s ease',
    },
    ':hover::after': {
      backgroundColor: colors.accent,
    },
    ':focus-visible': {
      outline: 'none',
    },
    ':focus-visible::after': {
      backgroundColor: colors.accent,
    },
  },
  col: {
    'bottom': 0,
    'cursor': 'col-resize',
    'top': 0,
    'width': '9px',
    '::after': {
      bottom: 0,
      left: '3px',
      top: 0,
      width: '3px',
    },
  },
  row: {
    'cursor': 'row-resize',
    'height': '9px',
    'left': 0,
    'right': 0,
    '::after': {
      height: '3px',
      left: 0,
      right: 0,
      top: '3px',
    },
  },
  dragging: {
    '::after': {
      backgroundColor: colors.accent,
    },
  },
});

/**
 * The divider between grid charts: drag it to resize them, double-click it (or press Home)
 * for an even split, or move it with the arrow keys. While dragging it reports positions
 * through onDraft; the final one goes to onCommit, which saves it.
 */
export function GridSplitter({
  axis,
  value,
  containerRef,
  onDraft,
  onCommit,
}: {
  axis: SplitAxis;
  value: number;
  containerRef: RefObject<HTMLElement | null>;
  onDraft: (value: number | null) => void;
  onCommit: (value: number) => void;
}) {
  const { t: i18n } = useLocale();
  const [dragging, setDragging] = useState(false);
  const stopDragRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopDragRef.current?.(), []);

  const measure = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return axis === 'col'
      ? { start: rect.left, size: rect.width }
      : { start: rect.top, size: rect.height };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const box = measure();
    if (!box || box.size <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopDragRef.current?.();
    const [lo, hi] = splitBounds(box.size);
    const pointerId = event.pointerId;
    let latest = value;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = axis === 'col' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    setDragging(true);

    const onMove = (move: globalThis.PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const at = (axis === 'col' ? move.clientX : move.clientY) - box.start;
      latest = Math.min(hi, Math.max(lo, at / box.size));
      onDraft(latest);
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
      onDraft(null);
      onCommit(latest);
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
    const [lo, hi] = splitBounds(measure()?.size ?? 0);
    const back = axis === 'col' ? 'ArrowLeft' : 'ArrowUp';
    const forward = axis === 'col' ? 'ArrowRight' : 'ArrowDown';
    const next =
      event.key === back
        ? value - KEY_STEP
        : event.key === forward
          ? value + KEY_STEP
          : event.key === 'Home'
            ? 0.5
            : null;
    if (next === null) return;
    event.preventDefault();
    onCommit(next === 0.5 ? next : Math.min(hi, Math.max(lo, next)));
  };

  const label = axis === 'col' ? i18n('chartGridResizeCols') : i18n('chartGridResizeRows');
  return (
    <div
      className={`chart-grid-splitter chart-grid-splitter--${axis} ${stylex.props(styles.splitter, axis === 'col' ? styles.col : styles.row, dragging && styles.dragging).className}`}
      style={axis === 'col' ? { left: `calc(${value * 100}% - 4px)` } : { top: `calc(${value * 100}% - 4px)` }}
      role="separator"
      aria-orientation={axis === 'col' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuemin={10}
      aria-valuemax={90}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      title={i18n('chartGridResizeHelp')}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(0.5)}
    />
  );
}
