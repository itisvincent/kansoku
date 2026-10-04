import { useLocale } from '@web/lib/i18n';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { IntradayTfData } from '@kansoku/shared/types';
import type { ChartViewTimeframeResult } from '@kansoku/core/contract/charts';
import { isViewPeriod, type ChartTf } from './timeframes';
import { feedKey, feedState, subscribeFeed, type FeedParams, type FeedState } from './viewTimeframeFeed';

export interface ViewTimeframeState {
  tf: IntradayTfData | null;
  error: string | null;
  loading: boolean;
  fallbackError?: boolean;
  historyStatus?: ChartViewTimeframeResult['historyStatus'];
  notice?: string;
}

const IDLE: FeedState = { tf: null, error: null, loading: false };
const noSubscription = () => () => {};

/**
 * Candles for a period the chart doc does not carry (1m, 30m, 4h, day, week, month), kept
 * fresh every 15s while live. Callers asking for the same symbol, period and as-of time
 * share one request (see viewTimeframeFeed). A new symbol or period starts empty, so the
 * chart never shows the previous one's candles while the new ones load.
 */
export function useViewTimeframe(
  symbol: string,
  activeTf: ChartTf,
  options: { asOf?: string; live?: boolean } = {},
): ViewTimeframeState {
  const { t } = useLocale();
  const { asOf, live = false } = options;
  const params = useMemo<FeedParams | null>(
    () => (symbol && isViewPeriod(activeTf) ? { symbol, period: activeTf, asOf, live } : null),
    [symbol, activeTf, asOf, live],
  );
  const subscribe = useCallback(
    (onChange: () => void) => (params ? subscribeFeed(params, onChange) : noSubscription()),
    [params],
  );
  const getSnapshot = useCallback(() => (params ? feedState(feedKey(params)) : IDLE), [params]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
