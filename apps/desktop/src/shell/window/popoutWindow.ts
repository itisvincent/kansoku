import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import { windowBackground, windowFrameOptions } from './frame.js';
import { IS_DEV } from '../../boot/env.js';
import {
  APP_ICON_PNG,
  applyWindowSecurity,
  DEV_WEB_URL,
  PROD_APP_URL,
} from './mainWindow.js';

const SYMBOL_PATTERN = /^(?=.*[\da-z])[\d.a-z\-]{1,20}$/i;

const POPOUT_DEFAULT_WIDTH = 520;
const POPOUT_DEFAULT_HEIGHT = 420;
const POPOUT_MIN_WIDTH = 360;
const POPOUT_MIN_HEIGHT = 300;
const POPOUT_CASCADE_OFFSET = 24;

export function isValidPopoutSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}

export function popoutRoute(symbol: string): string {
  return `/popout/symbol/${encodeURIComponent(symbol)}`;
}

export function popoutUrl(symbol: string): string {
  return new URL(popoutRoute(symbol), IS_DEV ? DEV_WEB_URL : PROD_APP_URL).toString();
}

export function cascadePosition(
  anchor: { x: number; y: number },
  index: number,
  offset: number = POPOUT_CASCADE_OFFSET,
): { x: number; y: number } {
  return { x: anchor.x + offset * index, y: anchor.y + offset * index };
}

const popoutWindows = new Set<BrowserWindow>();

/**
 * Which cascade step the next pop-out takes: one per pop-out still open, wrapping back
 * to the first step before a window would run off the work area. A counter that only
 * grew pushed every new pop-out 24px further until they opened off-screen.
 */
export function cascadeStep(
  openCount: number,
  workArea: { width: number; height: number },
  size: { width: number; height: number } = {
    width: POPOUT_DEFAULT_WIDTH,
    height: POPOUT_DEFAULT_HEIGHT,
  },
  offset: number = POPOUT_CASCADE_OFFSET,
): number {
  const room = Math.min(workArea.width - size.width, workArea.height - size.height) - 80;
  const steps = Math.max(1, Math.floor(room / offset) + 1);
  return openCount % steps;
}

export function isPopoutWindow(win: BrowserWindow): boolean {
  return popoutWindows.has(win);
}

function nextCascadePosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  const anchor = { x: workArea.x + 80, y: workArea.y + 80 };
  return cascadePosition(anchor, cascadeStep(popoutWindows.size, workArea));
}

export function createPopoutWindow(symbol: string): BrowserWindow {
  if (!isValidPopoutSymbol(symbol)) {
    throw new Error(`invalid popout symbol: ${symbol}`);
  }

  const position = nextCascadePosition();

  const win = new BrowserWindow({
    x: position.x,
    y: position.y,
    width: POPOUT_DEFAULT_WIDTH,
    height: POPOUT_DEFAULT_HEIGHT,
    minWidth: POPOUT_MIN_WIDTH,
    minHeight: POPOUT_MIN_HEIGHT,
    backgroundColor: windowBackground(),
    show: false,
    ...windowFrameOptions(),
    ...(existsSync(APP_ICON_PNG) ? { icon: APP_ICON_PNG } : {}),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(app.getAppPath(), 'dist-preload', 'preload.cjs'),
    },
  });

  popoutWindows.add(win);
  win.on('closed', () => {
    popoutWindows.delete(win);
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  const devUrl = IS_DEV ? DEV_WEB_URL : undefined;
  applyWindowSecurity(win, devUrl);

  win.loadURL(popoutUrl(symbol));
  return win;
}
