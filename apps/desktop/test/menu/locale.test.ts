import { afterEach, expect, test, vi } from 'vitest';
import {
  setActiveInterfaceLocaleStore,
  setInterfaceLocale,
  type InterfaceLocale,
} from '@kansoku/core/settings/interfaceLocale';
import { createAppMenuManager } from '@desktop/shell/menu/appMenuManager.js';
import { installDefaultContextMenu } from '@desktop/shell/contextMenu/defaultMenu.js';
import { desktopText } from '@desktop/shell/i18n.js';
import type { MenuActionDeps } from '@desktop/shell/menu/types.js';

const mockContextMenu = vi.hoisted(() => vi.fn((_options: unknown) => vi.fn()));
vi.mock('electron-context-menu', () => ({ default: mockContextMenu }));
afterEach(() => setActiveInterfaceLocaleStore(null));

test('switches installed native menus and context labels without restarting', async () => {
  let locale: InterfaceLocale = 'en-US';
  setActiveInterfaceLocaleStore({
    get: () => locale,
    set: (next) => {
      locale = next;
    },
  });
  const build = vi.fn(
    (items: Electron.MenuItemConstructorOptions[]) => items as unknown as Electron.Menu,
  );
  const deps: MenuActionDeps = {
    updateAvailable: () => false,
    openAbout: vi.fn(),
    openSettings: vi.fn(),
    openLogs: vi.fn(),
    openWorkspace: vi.fn(),
    importFromRepo: vi.fn(),
    openResearch: vi.fn(),
    openChat: vi.fn(),
    openTrainer: vi.fn(),
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
    newWindow: vi.fn(),
    newTab: vi.fn(),
    closeTab: vi.fn(),
    nextTab: vi.fn(),
    prevTab: vi.fn(),
  };
  const manager = createAppMenuManager({
    appName: 'Kansoku',
    deps,
    buildFromTemplate: build,
    setApplicationMenu: vi.fn(),
  });
  manager.install();
  await installDefaultContextMenu();
  const options = mockContextMenu.mock.calls[0]![0] as unknown as { labels: { copy: string } };
  expect(build.mock.calls.at(-1)![0].map((item) => item.label)).toContain('Go');
  expect(options.labels.copy).toBe('Copy');
  expect(desktopText('重试', 'Retry')).toBe('Retry');
  setInterfaceLocale('zh-CN');
  expect(build).toHaveBeenCalledTimes(2);
  expect(build.mock.calls.at(-1)![0].map((item) => item.label)).toContain('前往');
  expect(options.labels.copy).toBe('复制');
  expect(desktopText('重试', 'Retry')).toBe('重试');
});

