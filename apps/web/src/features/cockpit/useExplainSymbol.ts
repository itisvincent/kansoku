import { useLocale } from '@web/lib/i18n';
import { localizeStatusMessage } from './statusMessages';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExplainResult } from '@kansoku/shared/types';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';

const EXPLAIN_REASON_TEXT: Record<string, string> = {
  disabled: 'local:cockpitExplainUnconfigured',
  busy: 'local:cockpitExplainBusy',
  failed: 'local:cockpitExplainFailed',
};

export interface ExplainSymbolController {
  pending: boolean;
  hint: string | null;
  explain: () => Promise<void>;
}

export function useExplainSymbol(symbol: string): ExplainSymbolController {
  const { locale } = useLocale();
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const tokenRef = useRef<object | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      tokenRef.current = null;
    };
  }, []);

  useEffect(() => {
    tokenRef.current = null;
    setPending(false);
    setHint(null);
  }, [symbol]);

  const explain = useCallback(async () => {
    const token = {};
    tokenRef.current = token;
    setPending(true);
    setHint(null);

    try {
      const result: ExplainResult = await client.symbols.explain({ sym: symbol });
      if (tokenRef.current !== token) return;
      if (!result.ok) setHint(EXPLAIN_REASON_TEXT[result.reason] ?? 'local:cockpitExplainFailed');
    } catch (caught: unknown) {
      if (tokenRef.current === token) setHint(errorMessage(caught));
    } finally {
      if (mountedRef.current && tokenRef.current === token) {
        tokenRef.current = null;
        setPending(false);
      }
    }
  }, [symbol]);

  return { pending, hint: localizeStatusMessage(hint, locale), explain };
}
