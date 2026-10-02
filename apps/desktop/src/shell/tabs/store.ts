import { writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

const HOME_ROUTE = '/';
const DEFAULT_TITLE = 'Kansoku';
const DEFAULT_DEBOUNCE_MS = 500;

export interface TabState {
  id: string;
  route: string;
  title: string;
  scrollY: number;
  /** Pinned by the user: kept right after home and never closed until unpinned. */
  pinned?: boolean;
}

export interface TabsState {
  revision: number;
  tabs: TabState[];
}

export type MutateOp =
  | { op: 'open'; route: string; id?: string }
  | { op: 'close'; id: string }
  | { op: 'closeOthers'; id: string }
  | { op: 'closeToRight'; id: string }
  | { op: 'move'; id: string; toIndex: number }
  | { op: 'updateRoute'; id: string; route: string }
  | { op: 'updateTitle'; id: string; title: string }
  | { op: 'updateScroll'; id: string; scrollY: number }
  | { op: 'setPinned'; id: string; pinned: boolean }
  | { op: 'adopt'; tabs: TabState[] };

function makeTab(route: string, id?: string): TabState {
  return { id: id ?? crypto.randomUUID(), route, title: DEFAULT_TITLE, scrollY: 0 };
}

function isHomeRoute(route: string): boolean {
  const queryIndex = route.indexOf('?');
  return (queryIndex === -1 ? route : route.slice(0, queryIndex)) === HOME_ROUTE;
}

function isPinnedTab(state: TabsState, id: string): boolean {
  return state.tabs.length > 0 && state.tabs[0].id === id;
}

/** Home or user-pinned: closing it takes an explicit unpin first. */
function isKeptTab(state: TabsState, id: string): boolean {
  return isPinnedTab(state, id) || state.tabs.some((tab) => tab.id === id && tab.pinned);
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

export function emptyTabsState(): TabsState {
  return { revision: 0, tabs: [] };
}

function withTabs(state: TabsState, tabs: TabState[]): TabsState {
  return { revision: state.revision + 1, tabs };
}

export function openTab(state: TabsState, route: string, id?: string): TabsState {
  const usableId = id && !state.tabs.some((tab) => tab.id === id) ? id : undefined;
  return withTabs(state, withPinnedHome([...state.tabs, makeTab(route, usableId)]));
}

export function closeTab(state: TabsState, id: string): TabsState {
  if (isKeptTab(state, id)) return state;
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  return withTabs(
    state,
    state.tabs.filter((tab) => tab.id !== id),
  );
}

export function closeOtherTabs(state: TabsState, id: string): TabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  const tabs = state.tabs.filter((tab, index) => index === 0 || tab.pinned || tab.id === id);
  if (tabs.length === state.tabs.length) return state;
  return withTabs(state, tabs);
}

export function closeTabsToRight(state: TabsState, id: string): TabsState {
  const idx = state.tabs.findIndex((tab) => tab.id === id);
  if (idx === -1) return state;
  const tabs = state.tabs.filter((tab, index) => index <= idx || tab.pinned);
  if (tabs.length === state.tabs.length) return state;
  return withTabs(state, tabs);
}

function patchTab(state: TabsState, id: string, patch: Partial<Omit<TabState, 'id'>>): TabsState {
  const current = state.tabs.find((tab) => tab.id === id);
  if (!current) return state;
  const entries = Object.entries(patch) as Array<[keyof TabState, TabState[keyof TabState]]>;
  if (entries.every(([key, value]) => current[key] === value)) return state;
  return withTabs(
    state,
    state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
  );
}

export function updateTabRoute(state: TabsState, id: string, route: string): TabsState {
  return patchTab(state, id, { route });
}

export function updateTabTitle(state: TabsState, id: string, title: string): TabsState {
  return patchTab(state, id, { title });
}

export function updateTabScroll(state: TabsState, id: string, scrollY: number): TabsState {
  return patchTab(state, id, { scrollY });
}

/** Pins go to the end of the pinned group; an unpinned tab becomes the first unpinned one. */
export function setTabPinned(state: TabsState, id: string, pinned: boolean): TabsState {
  if (isPinnedTab(state, id)) return state;
  const current = state.tabs.find((tab) => tab.id === id);
  if (!current || Boolean(current.pinned) === pinned) return state;
  const tabs = state.tabs.map((tab) => {
    if (tab.id !== id) return tab;
    if (pinned) return { ...tab, pinned: true };
    const { pinned: _dropped, ...rest } = tab;
    return rest;
  });
  return withTabs(state, withPinnedHome(tabs));
}

export function moveTab(state: TabsState, id: string, toIndex: number): TabsState {
  const from = state.tabs.findIndex((tab) => tab.id === id);
  if (from === -1 || from === 0) return state; // slot 0 is the pinned home tab
  // A tab stays inside its own group: pinned tabs at 1..pins, the rest after them.
  const pins = pinnedCount(state.tabs);
  const [low, high] = state.tabs[from].pinned ? [1, pins] : [pins + 1, state.tabs.length - 1];
  const target = Math.min(Math.max(Math.trunc(toIndex), low), high);
  if (target === from) return state;
  const tabs = [...state.tabs];
  const [moved] = tabs.splice(from, 1);
  tabs.splice(target, 0, moved as TabState);
  return withTabs(state, tabs);
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

export function adoptTabs(state: TabsState, tabs: TabState[]): TabsState {
  if (state.tabs.length > 0) return state;
  const valid = tabs.filter(isValidTab);
  if (valid.length === 0) return state;
  return { revision: state.revision + 1, tabs: withPinnedHome(valid) };
}

export function cycleTabId(state: TabsState, activeTabId: string, delta: 1 | -1): string | null {
  if (state.tabs.length < 2) return null;
  const idx = state.tabs.findIndex((tab) => tab.id === activeTabId);
  if (idx === -1) return null;
  return state.tabs[(idx + delta + state.tabs.length) % state.tabs.length].id;
}

export type CloseTabAction =
  | { kind: 'close-window' }
  | { kind: 'close-tab'; id: string }
  | { kind: 'keep' }
  | { kind: 'delegate' };

// The pinned home tab can never be closed on its own, so Cmd+W there falls
// through to the window — otherwise the shortcut would be a dead key whenever
// other tabs are open and no keyboard path to closing the window would remain.
export function resolveCloseTabAction(state: TabsState, activeTabId: string): CloseTabAction {
  const active = state.tabs.find((tab) => tab.id === activeTabId);
  if (!active) return { kind: 'delegate' };
  // A user-pinned tab exists to survive a stray shortcut, so it neither closes nor
  // takes the window with it.
  if (active.pinned) return { kind: 'keep' };
  if (!isPinnedTab(state, active.id)) return { kind: 'close-tab', id: active.id };
  return { kind: 'close-window' };
}

export function applyMutation(state: TabsState, mutation: MutateOp): TabsState {
  switch (mutation.op) {
    case 'open': {
      return openTab(state, mutation.route, mutation.id);
    }
    case 'close': {
      return closeTab(state, mutation.id);
    }
    case 'closeOthers': {
      return closeOtherTabs(state, mutation.id);
    }
    case 'closeToRight': {
      return closeTabsToRight(state, mutation.id);
    }
    case 'move': {
      return moveTab(state, mutation.id, mutation.toIndex);
    }
    case 'updateRoute': {
      return updateTabRoute(state, mutation.id, mutation.route);
    }
    case 'updateTitle': {
      return updateTabTitle(state, mutation.id, mutation.title);
    }
    case 'updateScroll': {
      return updateTabScroll(state, mutation.id, mutation.scrollY);
    }
    case 'setPinned': {
      // The renderer is not trusted to send a boolean; only a literal true/false counts.
      if (typeof mutation.pinned !== 'boolean') return state;
      return setTabPinned(state, mutation.id, mutation.pinned);
    }
    case 'adopt': {
      return adoptTabs(state, mutation.tabs);
    }
    default: {
      return state;
    }
  }
}

function isValidTabsState(value: unknown): value is TabsState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.revision === 'number' && Array.isArray(state.tabs) && state.tabs.every(isValidTab)
  );
}

export interface TabsFileStore {
  load(): Promise<TabsState>;
  scheduleSave(state: TabsState): void;
  flushSync(): void;
}

export function createTabsFileStore(
  filePath: string,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): TabsFileStore {
  let pending: TabsState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function writeNow(state: TabsState): Promise<void> {
    await writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
  }

  return {
    async load(): Promise<TabsState> {
      try {
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidTabsState(parsed)) return emptyTabsState();
        if (parsed.tabs.length === 0) return parsed;
        return { revision: parsed.revision, tabs: withPinnedHome(parsed.tabs) };
      } catch {
        return emptyTabsState();
      }
    },

    scheduleSave(state: TabsState): void {
      pending = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const toWrite = pending;
        pending = null;
        if (toWrite) void writeNow(toWrite);
      }, debounceMs);
    },

    flushSync(): void {
      if (timer) clearTimeout(timer);
      timer = null;
      const toWrite = pending;
      pending = null;
      if (toWrite) writeFileSync(filePath, JSON.stringify(toWrite), { mode: 0o600 });
    },
  };
}
