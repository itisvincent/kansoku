// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemeMode,
  followThemeChanges,
  readThemeMode,
  setThemeMode,
  THEME_STORAGE_KEY,
} from './themeMode';

afterEach(() => {
  localStorage.clear();
  applyThemeMode('dark');
});

describe('themeMode', () => {
  it('reads dark unless light was saved', () => {
    expect(readThemeMode()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readThemeMode()).toBe('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readThemeMode()).toBe('dark');
  });

  it('puts the light palette on <html> and takes it off again', () => {
    const root = document.documentElement;
    const before = root.className;
    applyThemeMode('light');
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(root.className).not.toBe(before);
    applyThemeMode('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(root.className).toBe(before);
  });

  it('saves a change and reloads, but not when nothing changed', () => {
    const reload = vi.fn();
    setThemeMode('dark', reload);
    expect(reload).not.toHaveBeenCalled();
    setThemeMode('light', reload);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the choice cannot be saved', () => {
    const reload = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setThemeMode('light', reload);
    expect(reload).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('reloads other windows when the theme is changed in one of them', () => {
    const reload = vi.fn();
    const stop = followThemeChanges('dark', reload);
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(reload).not.toHaveBeenCalled();
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });
});
