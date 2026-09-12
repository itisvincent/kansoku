import { useLocale } from '@web/lib/i18n';
import { localizeStatusMessage } from './statusMessages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trackFeatureUsed } from '@web/lib/analytics';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';

export const REASON_TEXT: Record<string, string> = {
  'analyst layer disabled': 'local:cockpitAnalystUnconfigured',
  'already running': 'local:cockpitAnalystBusy',
  'escalation on cooldown': 'local:cockpitAnalystCooldown',
};

interface ReassessResponse {
  started: boolean;
  reason?: string;
}

export type ReassessOutcome =
  { ok: true; data: ReassessResponse } | { ok: false; error: string; aborted: boolean };

export function useReassessSymbol(symbol: string): {
  pending: boolean;
  error: string | null;
  reassess: () => Promise<ReassessOutcome>;
} {
  const { locale } = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
  }, [symbol]);

  const reassess = useCallback(async (): Promise<ReassessOutcome> => {
    const token = {};
    tokenRef.current = token;
    setPending(true);
    setError(null);

    try {
      trackFeatureUsed('market_analysis');
      const data = await client.symbols.reassess({ sym: symbol });
      const superseded = tokenRef.current !== token;
      if (superseded) return { ok: false, error: 'local:cockpitCancelled', aborted: true };
      return { ok: true, data };
    } catch (caught: unknown) {
      const superseded = tokenRef.current !== token;
      const message = superseded ? 'local:cockpitCancelled' : errorMessage(caught);
      if (mountedRef.current && !superseded) setError(message);
      return { ok: false, error: message, aborted: superseded };
    } finally {
      if (mountedRef.current && tokenRef.current === token) {
        tokenRef.current = null;
        setPending(false);
      }
    }
  }, [symbol]);

  return { pending, error: localizeStatusMessage(error, locale), reassess };
}
