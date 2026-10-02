import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adoptTabs,
  applyMutation,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  createTabsFileStore,
  emptyTabsState,
  moveTab,
  openTab,
  resolveCloseTabAction,
  setTabPinned,
  type TabsState,
} from '@desktop/shell/tabs/store.js';

/** Home plus the given routes, opened in order. */
function stateWith(...routes: string[]): TabsState {
  return routes.reduce((state, route) => openTab(state, route), openTab(emptyTabsState(), '/'));
}

function routes(state: TabsState): string[] {
  return state.tabs.map((tab) => tab.route);
}

function idOf(state: TabsState, route: string): string {
  const tab = state.tabs.find((item) => item.route === route);
  if (!tab) throw new Error(`no tab for ${route}`);
  return tab.id;
}

const pin = (state: TabsState, route: string) => setTabPinned(state, idOf(state, route), true);

describe('setTabPinned', () => {
  it('pins a tab and moves it right after home', () => {
    const state = pin(stateWith('/a', '/b', '/c'), '/c');
    expect(routes(state)).toEqual(['/', '/c', '/a', '/b']);
    expect(state.tabs[1].pinned).toBe(true);
  });

  it('adds later pins after earlier ones', () => {
    const state = pin(pin(stateWith('/a', '/b', '/c'), '/c'), '/b');
    expect(routes(state)).toEqual(['/', '/c', '/b', '/a']);
  });

  it('unpinning puts the tab first among the unpinned tabs', () => {
    const pinned = pin(pin(stateWith('/a', '/b', '/c'), '/b'), '/c');
    const state = setTabPinned(pinned, idOf(pinned, '/b'), false);
    expect(routes(state)).toEqual(['/', '/c', '/b', '/a']);
    expect(state.tabs[2].pinned).toBeUndefined();
  });

  it('leaves the home tab and unchanged pins alone', () => {
    const state = pin(stateWith('/a'), '/a');
    expect(setTabPinned(state, state.tabs[0].id, true)).toBe(state);
    expect(setTabPinned(state, idOf(state, '/a'), true)).toBe(state);
    expect(setTabPinned(state, 'missing', true)).toBe(state);
  });
});

describe('closing pinned tabs', () => {
  it('refuses to close a pinned tab', () => {
    const state = pin(stateWith('/a', '/b'), '/a');
    expect(closeTab(state, idOf(state, '/a'))).toBe(state);
  });

  it('close others keeps home, pinned tabs and the chosen tab', () => {
    const state = pin(stateWith('/a', '/b', '/c'), '/a');
    expect(routes(closeOtherTabs(state, idOf(state, '/c')))).toEqual(['/', '/a', '/c']);
  });

  it('close to the right keeps pinned tabs on the right', () => {
    const state = pin(pin(stateWith('/a', '/b', '/c'), '/a'), '/b');
    expect(routes(closeTabsToRight(state, idOf(state, '/a')))).toEqual(['/', '/a', '/b']);
  });

  it('Cmd/Ctrl+W on a pinned tab keeps the tab and the window', () => {
    const state = pin(stateWith('/a', '/b'), '/a');
    expect(resolveCloseTabAction(state, idOf(state, '/a'))).toEqual({ kind: 'keep' });
    expect(resolveCloseTabAction(state, idOf(state, '/b'))).toEqual({
      kind: 'close-tab',
      id: idOf(state, '/b'),
    });
  });
});

describe('moving tabs around pins', () => {
  it('keeps a pinned tab inside the pinned group', () => {
    const state = pin(pin(stateWith('/a', '/b', '/c'), '/a'), '/b');
    expect(routes(moveTab(state, idOf(state, '/a'), 3))).toEqual(['/', '/b', '/a', '/c']);
  });

  it('keeps an unpinned tab out of the pinned group', () => {
    const state = pin(stateWith('/a', '/b', '/c'), '/a');
    expect(routes(moveTab(state, idOf(state, '/c'), 1))).toEqual(['/', '/a', '/c', '/b']);
  });
});

describe('pins over IPC and on disk', () => {
  it('applyMutation pins only on a literal true', () => {
    const state = stateWith('/a');
    const id = idOf(state, '/a');
    expect(applyMutation(state, { op: 'setPinned', id, pinned: true }).tabs[1].pinned).toBe(true);
    const sloppy = { op: 'setPinned', id, pinned: 'yes' } as unknown as Parameters<
      typeof applyMutation
    >[1];
    expect(applyMutation(state, sloppy)).toBe(state);
  });

  it('adopting a list drops tabs whose pin flag is not a boolean', () => {
    const adopted = adoptTabs(emptyTabsState(), [
      { id: 'h', route: '/', title: 'Home', scrollY: 0 },
      { id: 'x', route: '/x', title: 'X', scrollY: 0, pinned: 'yes' as unknown as boolean },
    ]);
    expect(adopted.tabs.map((tab) => tab.id)).toEqual(['h']);
  });

  it('loads a saved file with pins regrouped after home', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tabs-pinned-'));
    try {
      const file = join(dir, 'tabs.json');
      await writeFile(
        file,
        JSON.stringify({
          revision: 4,
          tabs: [
            { id: 'h', route: '/', title: 'Home', scrollY: 0 },
            { id: 'a', route: '/a', title: 'A', scrollY: 0 },
            { id: 'b', route: '/b', title: 'B', scrollY: 0, pinned: true },
          ],
        }),
      );
      const loaded = await createTabsFileStore(file).load();
      expect(loaded.tabs.map((tab) => tab.id)).toEqual(['h', 'b', 'a']);
      expect(loaded.tabs[1].pinned).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
