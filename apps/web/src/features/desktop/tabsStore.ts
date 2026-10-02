const STORAGE_KEY = 'desktop-tabs-v1';
const HOME_ROUTE = '/';
const DEFAULT_TITLE = 'Kansoku';

export type TabState = {
  id: string;
  route: string;
  title: string;
  scrollY: number;
  /** Pinned by the user: kept right after home and never closed until unpinned. */
  pinned?: boolean;
};

export type TabsSnapshot = {
  tabs: TabState[];
  activeTabId: string;
};

export type TabKind = 'home' | 'research' | 'chat' | 'settings' | 'logs' | 'symbol' | 'other';

export function isHomeRoute(route: string): boolean {
  const queryIndex = route.indexOf('?');
  return (queryIndex === -1 ? route : route.slice(0, queryIndex)) === HOME_ROUTE;
}

function isPinnedTab(snapshot: TabsSnapshot, id: string): boolean {
  return snapshot.tabs.length > 0 && snapshot.tabs[0].id === id;
}

/** Home or user-pinned: closing it takes an explicit unpin first. */
function isKeptTab(snapshot: TabsSnapshot, id: string): boolean {
  return isPinnedTab(snapshot, id) || snapshot.tabs.some((tab) => tab.id === id && tab.pinned);
}

/** Number of user-pinned tabs, which always sit at indexes 1..count. */
function pinnedCount(tabs: TabState[]): number {
  return tabs.slice(1).filter((tab) => tab.pinned).length;
}

// Home first, then user-pinned tabs, then the rest, each group in its existing order.
function withPinnedHome(tabs: TabState[]): TabState[] {
  const pinned = tabs.length > 0 && isHomeRoute(tabs[0].route) ? tabs[0] : makeTab(HOME_ROUTE);
  const rest = tabs.filter((tab) => tab.id !== pinned.id && !isHomeRoute(tab.route));
  const ordered = [...rest.filter((tab) => tab.pinned), ...rest.filter((tab) => !tab.pinned)];
  if (tabs[0] === pinned && ordered.length === tabs.length - 1) {
    if (ordered.every((tab, index) => tab === tabs[index + 1])) return tabs;
  }
  return [pinned, ...ordered];
}

export function tabKind(route: string): TabKind {
  if (isHomeRoute(route)) return 'home';
  if (route === '/research' || route.startsWith('/research?')) return 'research';
  if (route === '/chat' || route.startsWith('/chat?')) return 'chat';
  if (route === '/settings' || route.startsWith('/settings?') || route.startsWith('/settings/'))
    return 'settings';
  if (route === '/logs' || route.startsWith('/logs?')) return 'logs';
  if (route.startsWith('/symbol/')) return 'symbol';
  return 'other';
}

function makeTab(route: string): TabState {
  return { id: crypto.randomUUID(), route, title: DEFAULT_TITLE, scrollY: 0 };
}

function defaultSnapshot(): TabsSnapshot {
  const tab = makeTab(HOME_ROUTE);
  return { tabs: [tab], activeTabId: tab.id };
}

function isValidTab(value: unknown): value is TabState {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Record<string, unknown>;
  return (
    typeof tab.id === 'string' &&
    typeof tab.route === 'string' &&
    typeof tab.title === 'string' &&
    typeof tab.scrollY === 'number' &&
    (tab.pinned === undefined || typeof tab.pinned === 'boolean')
  );
}

export function loadTabsSnapshot(storage: Pick<Storage, 'getItem'> = localStorage): TabsSnapshot {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultSnapshot();
    const parsed = JSON.parse(raw) as Partial<TabsSnapshot>;
    const parsedTabs = Array.isArray(parsed.tabs) ? parsed.tabs.filter(isValidTab) : [];
    if (parsedTabs.length === 0) return defaultSnapshot();
    const tabs = withPinnedHome(parsedTabs);
    const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId)
      ? (parsed.activeTabId as string)
      : tabs[0].id;
    return { tabs, activeTabId };
  } catch {
    return defaultSnapshot();
  }
}

export function saveTabsSnapshot(
  snapshot: TabsSnapshot,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Blocked or full storage: the tabs still work, they are just not remembered.
  }
}

function patchTab(
  snapshot: TabsSnapshot,
  id: string,
  patch: Partial<Omit<TabState, 'id'>>,
): TabsSnapshot {
  return {
    ...snapshot,
    tabs: snapshot.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
  };
}

export function updateTabRoute(snapshot: TabsSnapshot, id: string, route: string): TabsSnapshot {
  return patchTab(snapshot, id, { route });
}

export function updateTabTitle(snapshot: TabsSnapshot, id: string, title: string): TabsSnapshot {
  return patchTab(snapshot, id, { title });
}

export function updateTabScroll(snapshot: TabsSnapshot, id: string, scrollY: number): TabsSnapshot {
  return patchTab(snapshot, id, { scrollY });
}

export function openTab(snapshot: TabsSnapshot, route: string): TabsSnapshot {
  const tab = makeTab(route);
  return { tabs: withPinnedHome([...snapshot.tabs, tab]), activeTabId: tab.id };
}

export function activateTab(snapshot: TabsSnapshot, id: string): TabsSnapshot {
  if (!snapshot.tabs.some((tab) => tab.id === id)) return snapshot;
  return { ...snapshot, activeTabId: id };
}

export function moveTab(snapshot: TabsSnapshot, id: string, toIndex: number): TabsSnapshot {
  const from = snapshot.tabs.findIndex((tab) => tab.id === id);
  if (from === -1 || from === 0) return snapshot; // index 0 is the pinned home tab
  // Slot 0 belongs to home; a tab stays inside its group (pinned at 1..pins, the rest after).
  const pins = pinnedCount(snapshot.tabs);
  const [low, high] = snapshot.tabs[from].pinned ? [1, pins] : [pins + 1, snapshot.tabs.length - 1];
  const target = Math.min(Math.max(toIndex, low), high);
  if (target === from) return snapshot;
  const tabs = [...snapshot.tabs];
  const [moved] = tabs.splice(from, 1);
  tabs.splice(target, 0, moved as TabState);
  return { tabs, activeTabId: snapshot.activeTabId };
}

export function closeTab(snapshot: TabsSnapshot, id: string): TabsSnapshot {
  if (isKeptTab(snapshot, id)) return snapshot;
  const idx = snapshot.tabs.findIndex((tab) => tab.id === id);
  if (idx === -1) return snapshot;

  const remaining = snapshot.tabs.filter((tab) => tab.id !== id);
  if (snapshot.activeTabId !== id) return { tabs: remaining, activeTabId: snapshot.activeTabId };

  const nextActive = remaining[Math.min(idx, remaining.length - 1)];
  return { tabs: remaining, activeTabId: nextActive.id };
}

export function closeOtherTabs(snapshot: TabsSnapshot, id: string): TabsSnapshot {
  if (!snapshot.tabs.some((tab) => tab.id === id)) return snapshot;
  return {
    tabs: snapshot.tabs.filter((tab, index) => index === 0 || tab.pinned || tab.id === id),
    activeTabId: id,
  };
}

export function closeTabsToRight(snapshot: TabsSnapshot, id: string): TabsSnapshot {
  const idx = snapshot.tabs.findIndex((tab) => tab.id === id);
  if (idx === -1) return snapshot;
  const tabs = snapshot.tabs.filter((tab, index) => index <= idx || tab.pinned);
  const activeTabId = tabs.some((tab) => tab.id === snapshot.activeTabId)
    ? snapshot.activeTabId
    : id;
  return { tabs, activeTabId };
}

export function closeActiveTab(snapshot: TabsSnapshot): TabsSnapshot {
  return closeTab(snapshot, snapshot.activeTabId);
}

/** Pins go to the end of the pinned group; an unpinned tab becomes the first unpinned one. */
export function setTabPinned(snapshot: TabsSnapshot, id: string, pinned: boolean): TabsSnapshot {
  if (isPinnedTab(snapshot, id)) return snapshot;
  const current = snapshot.tabs.find((tab) => tab.id === id);
  if (!current || Boolean(current.pinned) === pinned) return snapshot;
  const tabs = snapshot.tabs.map((tab) => {
    if (tab.id !== id) return tab;
    if (pinned) return { ...tab, pinned: true };
    const { pinned: _dropped, ...rest } = tab;
    return rest;
  });
  return { ...snapshot, tabs: withPinnedHome(tabs) };
}

export function nextTab(snapshot: TabsSnapshot): TabsSnapshot {
  if (snapshot.tabs.length < 2) return snapshot;
  const idx = snapshot.tabs.findIndex((tab) => tab.id === snapshot.activeTabId);
  const next = snapshot.tabs[(idx + 1) % snapshot.tabs.length];
  return { ...snapshot, activeTabId: next.id };
}

export function prevTab(snapshot: TabsSnapshot): TabsSnapshot {
  if (snapshot.tabs.length < 2) return snapshot;
  const idx = snapshot.tabs.findIndex((tab) => tab.id === snapshot.activeTabId);
  const prev = snapshot.tabs[(idx - 1 + snapshot.tabs.length) % snapshot.tabs.length];
  return { ...snapshot, activeTabId: prev.id };
}

export function focusOrOpenRoute(snapshot: TabsSnapshot, route: string): TabsSnapshot {
  const existing = snapshot.tabs.find((tab) => tab.route === route);
  if (existing) return { ...snapshot, activeTabId: existing.id };
  return openTab(snapshot, route);
}

export function focusOrOpenRoutePrefix(
  snapshot: TabsSnapshot,
  prefix: string,
  initialRoute: string,
): TabsSnapshot {
  const existing = snapshot.tabs.find(
    (tab) =>
      tab.route === prefix ||
      tab.route.startsWith(`${prefix}?`) ||
      tab.route.startsWith(`${prefix}/`),
  );
  if (existing) return { ...snapshot, activeTabId: existing.id };
  return openTab(snapshot, initialRoute);
}
