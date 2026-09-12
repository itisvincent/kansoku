import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { appMeta } from '../db/schema.js';
import { ClientError } from '../platform/errors.js';

export type InterfaceLocale = 'en-US' | 'zh-CN';
export const DEFAULT_INTERFACE_LOCALE: InterfaceLocale = 'en-US';
const LOCALE_KEY = 'interface_locale_v1';

export interface InterfaceLocaleStore {
  get(): InterfaceLocale;
  set(locale: InterfaceLocale): void;
}

export function validateInterfaceLocale(value: unknown): InterfaceLocale {
  if (value !== 'en-US' && value !== 'zh-CN') {
    throw new ClientError('Unsupported interface language. Expected en-US or zh-CN.');
  }
  return value;
}

export function createInterfaceLocaleStore(db: Db): InterfaceLocaleStore {
  let saved = db.select().from(appMeta).where(eq(appMeta.key, LOCALE_KEY)).get()?.value;
  let locale: InterfaceLocale = saved === 'zh-CN' ? 'zh-CN' : DEFAULT_INTERFACE_LOCALE;
  return {
    get: () => locale,
    set(value) {
      const next = validateInterfaceLocale(value);
      if (next === locale && saved === next) return;
      db.insert(appMeta)
        .values({ key: LOCALE_KEY, value: next })
        .onConflictDoUpdate({ target: appMeta.key, set: { value: next } })
        .run();
      locale = next;
      saved = next;
    },
  };
}

let active: InterfaceLocaleStore | null = null;
const listeners = new Set<() => void>();

export function subscribeInterfaceLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setActiveInterfaceLocaleStore(store: InterfaceLocaleStore | null): void {
  active = store;
}

export function getInterfaceLocale(): InterfaceLocale {
  return active?.get() ?? DEFAULT_INTERFACE_LOCALE;
}

export function setInterfaceLocale(value: unknown): InterfaceLocale {
  const locale = validateInterfaceLocale(value);
  if (!active) throw new Error('Interface language store is not initialized');
  const previous = active.get();
  active.set(locale);
  if (previous !== locale) for (const listener of listeners) listener();
  return locale;
}

export function interfaceLanguageName(locale = getInterfaceLocale()): string {
  return locale === 'en-US' ? 'English' : 'Simplified Chinese';
}

export function interfaceLanguageInstruction(): string {
  return `Current interface language: ${interfaceLanguageName()}. Use this language for all generated natural-language content, including replies, titles, research documents and chart annotations. This preference replaces default language rules in the supplied skills. Preserve identifiers, file paths, source quotations and existing user content.`;
}
