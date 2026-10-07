import { useEffect, useRef } from 'react';
import { openPalette } from '../../palette/usePalette';
import type { ChartGridState, GridLayout } from './chartGridState';
import { useIntradayControls } from './controlsContext';
import { sanitizeTimeframes, type ChartTf } from './timeframes';

export type ChartShortcut =
  | { kind: 'layout'; layout: GridLayout }
  | { kind: 'tf'; step: -1 | 1 }
  | { kind: 'enlarge' }
  | { kind: 'search'; text: string };

const LAYOUT_KEYS: Record<string, GridLayout> = {
  Digit1: '1',
  Digit2: '2h',
  Digit3: '2v',
  Digit4: '4',
};

type KeyInfo = Pick<
  KeyboardEvent,
  'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat'
>;

/**
 * What a key press means on a chart page. Layouts go by key position (`code`), because
 * Alt+digit types a symbol on a Mac keyboard.
 */
export function readChartShortcut(e: KeyInfo): ChartShortcut | null {
  if (e.ctrlKey || e.metaKey) return null;
  if (e.altKey) {
    if (e.shiftKey) return null;
    if (LAYOUT_KEYS[e.code]) return { kind: 'layout', layout: LAYOUT_KEYS[e.code] };
    return e.key === 'Enter' ? { kind: 'enlarge' } : null;
  }
  if (e.key === '[') return { kind: 'tf', step: -1 };
  if (e.key === ']') return { kind: 'tf', step: 1 };
  if (!e.repeat && /^[a-z0-9]$/i.test(e.key)) return { kind: 'search', text: e.key.toUpperCase() };
  return null;
}

/**
 * The timeframe next to `current` among the ones the toolbar shows. A chart can sit on a
 * period the toolbar hides (a weekly chart in a grid); it steps from its own place in order.
 */
export function stepTf(shown: ChartTf[], current: ChartTf, step: -1 | 1): ChartTf {
  const order = shown.includes(current) ? shown : sanitizeTimeframes([...shown, current]);
  const at = order.indexOf(current);
  return order[Math.max(0, Math.min(order.length - 1, at + step))] ?? current;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [role="menu"], [role="combobox"]',
    ) !== null
  );
}

/**
 * Keyboard shortcuts for a chart page: Alt+1..4 pick a layout, [ and ] step the selected
 * chart's timeframe, Alt+Enter enlarges the selected grid chart, and typing a ticker opens
 * the search with it. Renders an empty marker inside the page, so a page in a hidden tab
 * leaves the keys to the one on screen.
 */
export function ChartShortcuts({ grid }: { grid: ChartGridState }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const { visibleTfs } = useIntradayControls();
  const stateRef = useRef({ grid, visibleTfs });
  stateRef.current = { grid, visibleTfs };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target)) return;
      const page = markerRef.current?.parentElement;
      if (!page || page.offsetWidth === 0) return;
      const shortcut = readChartShortcut(event);
      if (!shortcut) return;
      const { grid: g, visibleTfs: shown } = stateRef.current;
      if (shortcut.kind === 'enlarge' && g.layout === '1') return;
      event.preventDefault();
      if (shortcut.kind === 'layout') g.setLayout(shortcut.layout);
      else if (shortcut.kind === 'enlarge') g.toggleMaximize(g.activeCell);
      else if (shortcut.kind === 'search') openPalette(shortcut.text);
      else if (g.tf) g.setTf(stepTf(shown, g.tf, shortcut.step));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <span ref={markerRef} hidden />;
}
