import { getShellRpc } from './shellRpc';

interface WindowsContext {
  windowId: string;
  activeTabId: string;
}

export interface WindowsBridge {
  getContext(): Promise<WindowsContext | undefined>;
  reportActiveTab(activeTabId: string): void;
}

export function getWindowsBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): WindowsBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    getContext: () => rpc.invoke('windows.getContext') as Promise<WindowsContext | undefined>,
    reportActiveTab: (activeTabId: string) => {
      void rpc.invoke('windows.reportActiveTab', activeTabId);
    },
  };
}

export interface OpenWindowBridge {
  openWindow(activeTabId?: string): Promise<void>;
}

export function getOpenWindowBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): OpenWindowBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    openWindow: (activeTabId?: string) =>
      rpc.invoke('windows.openWindow', activeTabId ?? '') as Promise<void>,
  };
}

export interface PopoutBridge {
  openPopout(symbol: string): Promise<void>;
}

export function getPopoutBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): PopoutBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    openPopout: (symbol: string) => rpc.invoke('windows.openPopout', symbol) as Promise<void>,
  };
}

export interface AppMenuBridge {
  /** Opens the app menu with its top-left corner at (x, y) in window coordinates. */
  popupAppMenu(x: number, y: number): Promise<void>;
}

/** The app menu for windows without a menu bar (Windows, Linux). */
export function getAppMenuBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): AppMenuBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    popupAppMenu: (x: number, y: number) =>
      rpc.invoke('windows.popupAppMenu', x, y) as Promise<void>,
  };
}

/** Lets the desktop shell paint this window's title bar and background in the same theme. */
export function reportThemeToShell(
  mode: 'dark' | 'light',
  win: unknown = typeof window === 'undefined' ? undefined : window,
): void {
  const rpc = getShellRpc(win);
  if (!rpc) return;
  void rpc.invoke('windows.setTheme', mode).catch(() => {});
}

export interface OpenTrainerBridge {
  openTrainer(): Promise<void>;
}

export function getOpenTrainerBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): OpenTrainerBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    openTrainer: () => rpc.invoke('windows.openTrainer') as Promise<void>,
  };
}
