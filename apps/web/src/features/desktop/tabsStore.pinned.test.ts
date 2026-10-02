import { describe, expect, it } from 'vitest';
import {
  closeActiveTab,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  loadTabsSnapshot,
  moveTab,
  setTabPinned,
  type TabsSnapshot,
} from './tabsStore.js';

function snapshotOf(routes: string[], activeIndex = 0): TabsSnapshot {
  const tabs = routes.map((route, i) => ({ id: `t${i}`, route, title: 'Kansoku', scrollY: 0 }));
  return { tabs, activeTabId: tabs[activeIndex].id };
}

const ids = (snapshot: TabsSnapshot) => snapshot.tabs.map((tab) => tab.id);

describe('setTabPinned', () => {
  it('moves a pinned tab right after home and keeps it active', () => {
    const next = setTabPinned(snapshotOf(['/', '/a', '/b'], 2), 't2', true);
    expect(ids(next)).toEqual(['t0', 't2', 't1']);
    expect(next.tabs[1].pinned).toBe(true);
    expect(next.activeTabId).toBe('t2');
  });

  it('unpinning makes the tab the first unpinned one', () => {
    const pinned = setTabPinned(setTabPinned(snapshotOf(['/', '/a', '/b', '/c']), 't1', true), 't2', true);
    const next = setTabPinned(pinned, 't1', false);
    expect(ids(next)).toEqual(['t0', 't2', 't1', 't3']);
    expect(next.tabs[2].pinned).toBeUndefined();
  });

  it('ignores the home tab', () => {
    const snapshot = snapshotOf(['/', '/a']);
    expect(setTabPinned(snapshot, 't0', true)).toBe(snapshot);
  });
});

describe('pinned tabs survive close actions', () => {
  const pinnedA = () => setTabPinned(snapshotOf(['/', '/a', '/b', '/c'], 1), 't1', true);

  it('closeTab and closeActiveTab refuse a pinned tab', () => {
    const snapshot = pinnedA();
    expect(closeTab(snapshot, 't1')).toBe(snapshot);
    expect(closeActiveTab(snapshot)).toBe(snapshot);
  });

  it('close others keeps home and pinned tabs', () => {
    expect(ids(closeOtherTabs(pinnedA(), 't3'))).toEqual(['t0', 't1', 't3']);
  });

  it('close to the right keeps pinned tabs and moves focus off closed ones', () => {
    const snapshot = { ...setTabPinned(snapshotOf(['/', '/a', '/b', '/c'], 3), 't2', true) };
    // Order is now t0, t2 (pinned), t1, t3; closing right of t2 drops t1 and t3.
    const next = closeTabsToRight(snapshot, 't2');
    expect(ids(next)).toEqual(['t0', 't2']);
    expect(next.activeTabId).toBe('t2');
  });
});

describe('moveTab with pins', () => {
  it('keeps each tab inside its group', () => {
    const snapshot = setTabPinned(setTabPinned(snapshotOf(['/', '/a', '/b', '/c']), 't1', true), 't2', true);
    expect(ids(moveTab(snapshot, 't1', 3))).toEqual(['t0', 't2', 't1', 't3']);
    expect(ids(moveTab(snapshot, 't3', 1))).toEqual(['t0', 't1', 't2', 't3']);
  });
});

describe('loadTabsSnapshot with pins', () => {
  it('regroups pinned tabs after home and drops a non-boolean pin', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          activeTabId: 'b',
          tabs: [
            { id: 'h', route: '/', title: 'Home', scrollY: 0 },
            { id: 'a', route: '/a', title: 'A', scrollY: 0 },
            { id: 'b', route: '/b', title: 'B', scrollY: 0, pinned: true },
            { id: 'x', route: '/x', title: 'X', scrollY: 0, pinned: 'yes' },
          ],
        }),
    };
    const loaded = loadTabsSnapshot(storage);
    expect(ids(loaded)).toEqual(['h', 'b', 'a']);
    expect(loaded.activeTabId).toBe('b');
  });
});
