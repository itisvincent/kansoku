import { useEffect } from 'react';
import { client } from '@web/lib/client';
import { useLocale } from '@web/lib/i18n';

// Serialize writes so a slow previous selection cannot overwrite the latest one.
let pending: Promise<void> = Promise.resolve();

export function LocaleBackendSync() {
  const { locale } = useLocale();
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      pending = pending.then(async () => {
        if (cancelled) return;
        try {
          await client.settings.putInterfaceLocale({ locale });
        } catch {
          if (!cancelled) timer = setTimeout(sync, 3000);
        }
      });
    };
    sync();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locale]);
  return null;
}
