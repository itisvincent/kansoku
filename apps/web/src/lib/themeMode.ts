import * as stylex from '@stylexjs/stylex';
import { lightTheme } from '../theme/lightTheme';

export type ThemeMode = 'dark' | 'light';

/** Also read by the inline script in index.html, which paints the boot screen. */
export const THEME_STORAGE_KEY = 'kansoku.theme';

export function readThemeMode(storage: Pick<Storage, 'getItem'> | null = safeStorage()): ThemeMode {
  try {
    return storage?.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const lightClasses = (): string[] => (stylex.props(lightTheme).className ?? '').split(' ').filter(Boolean);

/** Puts the palette on <html> before the first render, so nothing paints in the other one. */
export function applyThemeMode(mode: ThemeMode, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  for (const name of lightClasses()) root.classList.toggle(name, mode === 'light');
}

/**
 * Saves the choice and reloads. Charts take their colors when they are drawn, so a reload is
 * how every chart, overlay and canvas switches at once; tabs and the active tab survive it.
 */
export function setThemeMode(mode: ThemeMode, reload: () => void = () => window.location.reload()): void {
  if (mode === readThemeMode()) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Unavailable storage: the choice can't be kept, so reloading would only bring the old
    // theme back.
    return;
  }
  reload();
}

/** Other windows (popout charts, the trainer) follow a change made in one of them. */
export function followThemeChanges(
  current: ThemeMode,
  reload: () => void = () => window.location.reload(),
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    if (readThemeMode() !== current) reload();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
