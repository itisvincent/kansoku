import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

/** Height of the app's own title bar (the tab strip). */
export const TITLEBAR_HEIGHT = 40;

export type WindowTheme = 'dark' | 'light';

// The web theme's backgroundCanvas, backgroundSurface and textSecondary for each palette.
const CHROME: Record<WindowTheme, { window: string; bar: string; symbol: string }> = {
  dark: { window: '#0a0a0a', bar: '#141414', symbol: '#9a9a9a' },
  light: { window: '#f4f4f5', bar: '#ffffff', symbol: '#5b5b63' },
};

const THEME_FILE = 'window-theme.json';
let current: WindowTheme = 'dark';
/** What window-theme.json holds, so a failed write is retried on the next change. */
let saved: WindowTheme | null = null;

export function parseWindowTheme(value: unknown): WindowTheme {
  return value === 'light' ? 'light' : 'dark';
}

export function currentWindowTheme(): WindowTheme {
  return current;
}

/** Reads the theme the last window reported, so new windows open in it without a flash. */
export function loadWindowTheme(dir: string): WindowTheme {
  try {
    current = parseWindowTheme(JSON.parse(readFileSync(join(dir, THEME_FILE), 'utf8')).theme);
    saved = current;
  } catch {
    current = 'dark';
    saved = null;
  }
  return current;
}

export function rememberWindowTheme(theme: WindowTheme, dir: string | null): void {
  current = theme;
  if (!dir || theme === saved) return;
  try {
    writeFileSync(join(dir, THEME_FILE), JSON.stringify({ theme }));
    saved = theme;
  } catch {
    // Only the first paint of the next window depends on it.
  }
}

export function windowBackground(theme: WindowTheme = current): string {
  return CHROME[theme].window;
}

type FrameOptions = Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'trafficLightPosition' | 'titleBarOverlay'
>;

/**
 * Every window draws its own title bar. macOS insets the traffic lights into it; Windows and
 * Linux hide the native frame and menu bar and draw their minimise / maximise / close buttons
 * over the app's bar (the page leaves room for them via the titlebar-area CSS variables).
 */
export function windowFrameOptions(
  platform: NodeJS.Platform = process.platform,
  theme: WindowTheme = current,
): FrameOptions {
  if (platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } };
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: CHROME[theme].bar,
      symbolColor: CHROME[theme].symbol,
      height: TITLEBAR_HEIGHT,
    },
  };
}

/** Repaints an open window's background and (Windows/Linux) window buttons for a theme. */
export function applyWindowTheme(
  win: Pick<BrowserWindow, 'setBackgroundColor' | 'setTitleBarOverlay'>,
  theme: WindowTheme,
  platform: NodeJS.Platform = process.platform,
): void {
  win.setBackgroundColor(CHROME[theme].window);
  if (platform === 'darwin') return;
  win.setTitleBarOverlay({
    color: CHROME[theme].bar,
    symbolColor: CHROME[theme].symbol,
    height: TITLEBAR_HEIGHT,
  });
}
