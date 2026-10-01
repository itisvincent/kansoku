const DEEP_LINK_SCHEME = 'kansoku:';
const DEEP_LINK_HOST = 'route';
export const DEEP_LINK_NAVIGATE_CHANNEL = 'deep-link:navigate';

export interface DeepLinkTarget {
  path: string;
  search: string;
}

export function parseDeepLink(url: string): DeepLinkTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== DEEP_LINK_SCHEME || parsed.host !== DEEP_LINK_HOST) return null;
  return { path: parsed.pathname || '/', search: parsed.search };
}

export function findDeepLinkArg(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}//`));
}

export interface DeepLinkWindow {
  webContents: { send: (channel: string, payload: DeepLinkTarget) => void };
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
}

export function dispatchDeepLink(win: DeepLinkWindow, url: string): boolean {
  const target = parseDeepLink(url);
  if (!target) return false;
  win.webContents.send(DEEP_LINK_NAVIGATE_CHANNEL, target);
  if (win.isMinimized()) win.restore();
  win.focus();
  return true;
}

/**
 * Holds a deep link that arrives before anyone listens (the page sends on load, React
 * subscribes later) and hands the latest one to the first subscriber.
 */
export function createDeepLinkInbox() {
  const subscribers = new Set<(target: DeepLinkTarget) => void>();
  let held: DeepLinkTarget | null = null;
  return {
    receive(target: DeepLinkTarget): void {
      if (subscribers.size === 0) {
        held = target;
        return;
      }
      for (const cb of subscribers) cb(target);
    },
    subscribe(cb: (target: DeepLinkTarget) => void): () => void {
      subscribers.add(cb);
      if (held) {
        const target = held;
        held = null;
        queueMicrotask(() => cb(target));
      }
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
