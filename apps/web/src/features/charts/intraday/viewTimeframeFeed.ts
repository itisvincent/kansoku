import type { IntradayTfData } from '@kansoku/shared/types';
import { client } from '@web/lib/client';
import type { ChartViewTimeframeResult } from '@kansoku/core/contract/charts';
import { sameTfData } from './chartRedraw';
import type { ViewPeriod } from './timeframes';

const REFETCH_MS = 15_000;

export interface FeedState {
  tf: IntradayTfData | null;
  error: string | null;
  loading: boolean;
  fallbackError?: boolean;
  historyStatus?: ChartViewTimeframeResult['historyStatus'];
}

export interface FeedParams {
  symbol: string;
  period: ViewPeriod;
  asOf?: string;
  live: boolean;
}

interface Feed {
  state: FeedState;
  listeners: Set<() => void>;
  stop: () => void;
}

/**
 * One request stream per symbol / period / as-of time, shared by everything that shows it.
 * A chart grid and its page both read the selected chart's period, and two grid charts can
 * sit on the same one: they get the same candles object, one fetch, and one 15s refresh.
 */
const feeds = new Map<string, Feed>();

export const feedKey = ({ symbol, period, asOf, live }: FeedParams): string =>
  `${symbol}|${period}|${asOf ?? ''}|${live ? 'live' : 'frozen'}`;

export const LOADING: FeedState = { tf: null, error: null, loading: true };

function startFeed(params: FeedParams, feed: Feed): () => void {
  const { symbol, period, asOf, live } = params;
  let stopped = false;
  const set = (next: FeedState) => {
    feed.state = next;
    feed.listeners.forEach((listener) => listener());
  };
  const fetchOnce = () => {
    client.charts
      .viewTimeframe({ symbol, period, ...(asOf ? { as_of: asOf } : {}) })
      .then((result) => {
        if (stopped) return;
        const previous = feed.state;
        // A refresh that brings back the same candles keeps the same object, so the charts
        // showing it have nothing to redraw (outside market hours, every refresh).
        const tf = sameTfData(previous.tf, result.tf as IntradayTfData)
          ? previous.tf
          : (result.tf as IntradayTfData);
        if (
          tf === previous.tf &&
          !previous.loading &&
          previous.error === null &&
          !previous.fallbackError &&
          JSON.stringify(previous.historyStatus) === JSON.stringify(result.historyStatus)
        ) {
          return;
        }
        set({
          tf,
          error: null,
          loading: false,
          historyStatus: result.historyStatus,
        });
      })
      .catch((err: unknown) => {
        if (stopped) return;
        // A failed live refresh keeps the last good candles for this same view.
        set({
          tf: feed.state.tf,
          error: err instanceof Error ? err.message : null,
          loading: false,
          fallbackError: !(err instanceof Error),
        });
      });
  };

  fetchOnce();
  const timer = live
    ? setInterval(() => {
        if (document.visibilityState === 'visible') fetchOnce();
      }, REFETCH_MS)
    : null;
  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

export function subscribeFeed(params: FeedParams, listener: () => void): () => void {
  const key = feedKey(params);
  let feed = feeds.get(key);
  if (!feed) {
    const created: Feed = { state: LOADING, listeners: new Set(), stop: () => {} };
    feeds.set(key, created);
    created.stop = startFeed(params, created);
    feed = created;
  }
  const subscribed = feed;
  subscribed.listeners.add(listener);
  return () => {
    subscribed.listeners.delete(listener);
    if (subscribed.listeners.size > 0) return;
    subscribed.stop();
    if (feeds.get(key) === subscribed) feeds.delete(key);
  };
}

export function feedState(key: string): FeedState {
  return feeds.get(key)?.state ?? LOADING;
}
