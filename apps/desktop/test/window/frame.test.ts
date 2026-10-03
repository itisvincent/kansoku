import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyWindowTheme,
  currentWindowTheme,
  loadWindowTheme,
  parseWindowTheme,
  rememberWindowTheme,
  TITLEBAR_HEIGHT,
  windowBackground,
  windowFrameOptions,
} from '@desktop/shell/window/frame.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('windowFrameOptions', () => {
  it('keeps the inset traffic lights on macOS', () => {
    expect(windowFrameOptions('darwin', 'dark')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
    });
  });

  it('draws the app’s own title bar on Windows, with Windows’ buttons over it', () => {
    expect(windowFrameOptions('win32', 'dark')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#141414', symbolColor: '#9a9a9a', height: TITLEBAR_HEIGHT },
    });
    expect(windowFrameOptions('win32', 'light')).toMatchObject({
      titleBarOverlay: { color: '#ffffff', symbolColor: '#5b5b63' },
    });
    expect(TITLEBAR_HEIGHT).toBe(40);
  });

  it('does the same on Linux', () => {
    expect(windowFrameOptions('linux', 'dark')).toMatchObject({ titleBarStyle: 'hidden' });
  });
});

describe('window theme', () => {
  it('reads anything but "light" as dark', () => {
    expect(parseWindowTheme('light')).toBe('light');
    expect(parseWindowTheme('bogus')).toBe('dark');
    expect(windowBackground('light')).toBe('#f4f4f5');
    expect(windowBackground('dark')).toBe('#0a0a0a');
  });

  it('remembers the last theme for the next launch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'window-theme-'));
    dirs.push(dir);
    expect(loadWindowTheme(dir)).toBe('dark');
    rememberWindowTheme('light', dir);
    expect(currentWindowTheme()).toBe('light');
    expect(JSON.parse(readFileSync(join(dir, 'window-theme.json'), 'utf8'))).toEqual({ theme: 'light' });
    expect(loadWindowTheme(dir)).toBe('light');
    rememberWindowTheme('dark', dir);
  });

  it('tries the save again after one fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'window-theme-'));
    dirs.push(dir);
    loadWindowTheme(dir);
    rememberWindowTheme('light', join(dir, 'missing'));
    expect(currentWindowTheme()).toBe('light');
    rememberWindowTheme('light', dir);
    expect(JSON.parse(readFileSync(join(dir, 'window-theme.json'), 'utf8'))).toEqual({ theme: 'light' });
    rememberWindowTheme('dark', dir);
  });

  it('repaints an open window, and leaves the macOS buttons alone', () => {
    const win = { setBackgroundColor: vi.fn(), setTitleBarOverlay: vi.fn() };
    applyWindowTheme(win, 'light', 'win32');
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#f4f4f5');
    expect(win.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#ffffff',
      symbolColor: '#5b5b63',
      height: TITLEBAR_HEIGHT,
    });
    const mac = { setBackgroundColor: vi.fn(), setTitleBarOverlay: vi.fn() };
    applyWindowTheme(mac, 'light', 'darwin');
    expect(mac.setTitleBarOverlay).not.toHaveBeenCalled();
  });
});
