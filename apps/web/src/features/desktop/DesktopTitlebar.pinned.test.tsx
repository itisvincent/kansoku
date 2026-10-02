// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextMenuItem } from '../../ui';
import type { TabsController } from './tabsController';
import type { TabState } from './tabsStore';
import { translate } from '@web/lib/i18n';

const menus: ContextMenuItem[][] = [];

vi.mock('../../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ui')>()),
  showContextMenu: (items: ContextMenuItem[]) => menus.push(items),
}));
vi.mock('../../lib/ws/useHubStatus', () => ({ useHubStatus: () => 'connected' }));
vi.mock('../edition/capabilitiesStore', () => ({
  useCapabilities: () => ({ pro: false, licensed: false }),
}));
vi.mock('../cockpit/analystRunsStore', () => ({ useAnalystRunIndicator: () => [false, false] }));
vi.mock('./NewTabLauncher', () => ({ NewTabLauncher: () => null }));

const { DesktopTitlebar } = await import('./DesktopTitlebar');
const t = (key: Parameters<typeof translate>[1]) => translate('zh-CN', key);

function controllerWith(tabs: TabState[], overrides: Partial<TabsController> = {}): TabsController {
  return {
    snapshot: { tabs, activeTabId: tabs[0].id },
    activeTab: tabs[0],
    activateTab: vi.fn(),
    moveTab: vi.fn(),
    closeTabById: vi.fn(),
    closeOtherTabs: vi.fn(),
    closeTabsToRight: vi.fn(),
    setTabPinned: vi.fn(),
    openTab: vi.fn(),
    newTabLauncherOpen: false,
    setNewTabLauncherOpen: vi.fn(),
    focusOrOpenHome: vi.fn(),
    focusOrOpenResearch: vi.fn(),
    focusOrOpenSettings: vi.fn(),
    focusOrOpenLogs: vi.fn(),
    focusOrOpenChat: vi.fn(),
    ...overrides,
  } as unknown as TabsController;
}

const home: TabState = { id: 'h', route: '/', title: 'Kansoku', scrollY: 0 };
const app: TabState = {
  id: 'app',
  route: '/symbol/APP.US',
  title: 'APP.US intraday multi-timeframe',
  scrollY: 0,
  pinned: true,
};
const nvda: TabState = { id: 'nvda', route: '/symbol/NVDA.US', title: 'NVDA', scrollY: 0 };

afterEach(() => {
  cleanup();
  menus.length = 0;
});

function menuItem(key: string) {
  const items = menus.at(-1) ?? [];
  return items.find((item) => 'key' in item && item.key === key) as
    | (ContextMenuItem & { label: string; disabled?: boolean; onClick: () => void })
    | undefined;
}

describe('DesktopTitlebar pinned tabs', () => {
  it('shows a pinned tab by its ticker, with a pin instead of a close button', () => {
    const { container } = render(<DesktopTitlebar controller={controllerWith([home, app, nvda])} />);
    const pinnedTab = container.querySelector('.desktop-tab--user-pinned');
    expect(pinnedTab?.textContent).toBe('APP');
    expect(pinnedTab?.querySelector('.desktop-tab-close')).toBeNull();
    expect(pinnedTab?.querySelector('.desktop-tab-pin')).not.toBeNull();
    expect(container.querySelectorAll('.desktop-tab-close')).toHaveLength(1);
  });

  it('offers unpin and disables close on a pinned tab', () => {
    const setTabPinned = vi.fn();
    const { container } = render(
      <DesktopTitlebar controller={controllerWith([home, app, nvda], { setTabPinned })} />,
    );
    fireEvent.contextMenu(container.querySelector('.desktop-tab--user-pinned')!);
    expect(menuItem('pin')?.label).toBe(t('unpinTab'));
    expect(menuItem('close')?.disabled).toBe(true);
    menuItem('pin')!.onClick();
    expect(setTabPinned).toHaveBeenCalledWith('app', false);
  });

  it('offers pin on a normal tab and never on home', () => {
    const setTabPinned = vi.fn();
    render(<DesktopTitlebar controller={controllerWith([home, app, nvda], { setTabPinned })} />);
    fireEvent.contextMenu(screen.getByText('NVDA'));
    expect(menuItem('pin')?.label).toBe(t('pinTab'));
    expect(menuItem('close')?.disabled).toBe(false);
    menuItem('pin')!.onClick();
    expect(setTabPinned).toHaveBeenCalledWith('nvda', true);

    fireEvent.contextMenu(document.querySelector('.desktop-tab--pinned')!);
    expect(menuItem('pin')).toBeUndefined();
  });

  it('disables bulk closes that would only hit pinned tabs', () => {
    const { container } = render(<DesktopTitlebar controller={controllerWith([home, app])} />);
    fireEvent.contextMenu(container.querySelector('.desktop-tab--user-pinned')!);
    expect(menuItem('close-others')?.disabled).toBe(true);
    expect(menuItem('close-right')?.disabled).toBe(true);
  });
});
