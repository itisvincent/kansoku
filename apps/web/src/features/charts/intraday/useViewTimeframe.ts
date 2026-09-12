import { useLocale } from '@web/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import type { IntradayTfData } from '@kansoku/shared/types';
import { client } from '@web/lib/client';
import type { ChartViewTimeframeResult } from '@kansoku/core/contract/charts';
import { isViewPeriod, type ChartTf } from './timeframes';

const REFETCH_MS = 15_000;

export interface ViewTimeframeState {
  tf: IntradayTfData | null;
  error: string | null;
  loading: boolean;
  fallbackError?: boolean;
  historyStatus?: ChartViewTimeframeResult['historyStatus'];
  notice?: string;
}

export function useViewTimeframe(
  symbol: string,
  activeTf: ChartTf,
  options: { asOf?: string; live?: boolean } = {},
): ViewTimeframeState {
  const { t } = useLocale();
  const { asOf, live = false } = options;
  const [state, setState] = useState<ViewTimeframeState>({ tf: null, error: null, loading: false });
  const wanted = isViewPeriod(activeTf) ? activeTf : null;
  const tokenRef = useRef<object | null>(null);

  useEffect(() => {
    if (!wanted || !symbol) {
      tokenRef.current = null;
      setState({ tf: null, error: null, loading: false });
      return;
    }

    let cancelled = false;
    const token = {};
    tokenRef.current = token;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const fetchOnce = () => {
      client.charts
        .viewTimeframe({ symbol, period: wanted, ...(asOf ? { as_of: asOf } : {}) })
        .then((result) => {
          if (cancelled || tokenRef.current !== token) return;
          setState({
            tf: result.tf as IntradayTfData,
            error: null,
            loading: false,
            historyStatus: result.historyStatus,
          });
        })
        .catch((err: unknown) => {
          if (cancelled || tokenRef.current !== token) return;
          const message = err instanceof Error ? err.message : null;
          setState({
            tf: null,
            error: message,
            loading: false,
            fallbackError: !(err instanceof Error),
          });
        });
    };

    fetchOnce();
    if (!live) return () => void (cancelled = true);

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOnce();
    }, REFETCH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, wanted, asOf, live]);

  const notice =
    state.historyStatus === 'denied'
      ? t('chartHistoryDenied')
      : state.historyStatus === 'limited' || state.historyStatus === 'unavailable'
        ? t('chartHistoryLimited')
        : undefined;
  return {
    ...state,
    ...(notice ? { notice } : {}),
    error: state.fallbackError ? t('chartTimeframeFailed') : state.error,
  };
}
