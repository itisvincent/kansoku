import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

export type Locale = 'zh-CN' | 'en-US';
export type MessageKey = keyof typeof zhCN;
export type MessageParams = Readonly<Record<string, string | number>>;
export const LOCALE_STORAGE_KEY = 'kansoku.locale';
const messages = { 'zh-CN': zhCN, 'en-US': enUS };

export function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  return messages[locale][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder,
  );
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
};

const fallback: LocaleContextValue = {
  locale: 'zh-CN',
  setLocale: () => {},
  t: (key, params) => translate('zh-CN', key, params),
};
const LocaleContext = createContext<LocaleContextValue>(fallback);

function normalizeLocale(value: string | null): Locale {
  return value === 'zh-CN' ? 'zh-CN' : 'en-US';
}

function readLocale(): Locale {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    // Restricted storage and server-side rendering must not prevent startup.
    return 'en-US';
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // The selection still applies for this window when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
        setLocaleState(normalizeLocale(event.newValue));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
