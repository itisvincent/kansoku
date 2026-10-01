import { chineseTranslator, readLocale, translate, type Translator } from '@web/lib/i18n';
import type { CommentLevel, MarketEventSeverity, Notice } from '@kansoku/shared/types';

export type NotifyEnvelope =
  | { type: 'comment'; live: boolean; symbol: string; level: CommentLevel; text: string }
  | { type: 'notice'; live: boolean; notice: Notice }
  | {
      type: 'event';
      live: boolean;
      id: string;
      title: string;
      body: string;
      symbols: string[];
      severity: MarketEventSeverity;
    };

export interface NotifyContext {
  hidden: boolean;
  permission: NotificationPermission | 'unsupported';
  activeSymbol?: string | null;
}

export interface NotifyContent {
  title: string;
  body: string;
}

function shortNotifySymbol(symbol: string): string {
  return symbol.replace(/\.US$/, '');
}

export function decideNotification(
  env: NotifyEnvelope,
  ctx: NotifyContext,
  tr: Translator = chineseTranslator,
): NotifyContent | null {
  if (!env.live) return null;
  if (ctx.permission !== 'granted') return null;
  if (env.type === 'event') {
    if (env.severity !== 'critical') return null;
    const activeSymbol = ctx.activeSymbol?.trim().toUpperCase();
    if (
      !ctx.hidden &&
      (ctx.activeSymbol === undefined ||
        env.symbols.some((symbol) => symbol.trim().toUpperCase() === activeSymbol))
    )
      return null;
    const hint = env.symbols.length
      ? env.symbols.map(shortNotifySymbol).join(' ')
      : tr('notificationMarket');
    return { title: tr('notificationMajor', { value1: hint }), body: env.title };
  }
  const symbol = env.type === 'comment' ? env.symbol : env.notice.symbol;
  const activeSymbol = ctx.activeSymbol?.trim().toUpperCase();
  if (
    !ctx.hidden &&
    (ctx.activeSymbol === undefined || activeSymbol === symbol.trim().toUpperCase())
  )
    return null;
  if (env.type === 'comment') {
    if (env.level !== 'alert') return null;
    return { title: tr('notificationAlert', { value1: env.symbol }), body: env.text };
  }
  return { title: env.notice.title, body: env.notice.body };
}

let permissionRequested = false;

export function requestNotificationPermissionOnce(): void {
  if (permissionRequested) return;
  permissionRequested = true;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') void Notification.requestPermission();
}

function notify(content: NotifyContent, tag?: string): void {
  if (typeof Notification === 'undefined') return;
  const n = new Notification(content.title, { body: content.body, ...(tag ? { tag } : {}) });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

function currentNotifyContext(activeSymbol?: string | null): NotifyContext {
  return {
    hidden: document.hidden || document.visibilityState !== 'visible',
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    activeSymbol,
  };
}

const SHOWN_PREFIX = 'kansoku:notified:';
const SHOWN_TTL_MS = 24 * 60 * 60_000;

function pruneShown(now: number): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith(SHOWN_PREFIX)) continue;
    if (now - Number(localStorage.getItem(key)) > SHOWN_TTL_MS) localStorage.removeItem(key);
  }
}

/**
 * True for the first window that claims `key`. Every open window receives the same
 * live event; without this each one showed its own copy. The check-and-set runs under
 * one Web Lock, which all windows of the app share, so two windows cannot both win.
 */
export async function claimNotification(key: string): Promise<boolean> {
  const storageKey = SHOWN_PREFIX + key;
  const checkAndSet = () => {
    try {
      if (localStorage.getItem(storageKey)) return false;
      const now = Date.now();
      localStorage.setItem(storageKey, String(now));
      pruneShown(now);
      return true;
    } catch {
      // No storage (private mode, blocked): fall back to showing it here.
      return true;
    }
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return checkAndSet();
  return locks.request('kansoku-notify', () => checkAndSet());
}

export function maybeNotify(
  env: NotifyEnvelope,
  activeSymbol?: string | null,
  key?: string,
): void {
  const content = decideNotification(env, currentNotifyContext(activeSymbol), (k, params) =>
    translate(readLocale(), k, params),
  );
  if (!content) return;
  if (!key) {
    notify(content);
    return;
  }
  void claimNotification(key).then((mine) => {
    if (mine) notify(content, key);
  });
}
