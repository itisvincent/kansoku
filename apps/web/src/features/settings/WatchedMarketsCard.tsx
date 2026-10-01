import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Switch } from '@web/ui';
import { marketLabel, type Market } from './types';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { toggleMarket } from './watchedMarkets';
import { useSaveQueue } from './useSaveQueue';
import { useLocale } from '../../lib/i18n';

const MARKET_ORDER: Market[] = ['US', 'HK', 'CN'];
const QUERY_KEY = 'settings.getWatchedMarkets';

export function WatchedMarketsCard() {
  const queryClient = useQueryClient();
  const { data, error, reload } = useQuery<{ markets: Market[] }>(
    QUERY_KEY,
    () => client.settings.getWatchedMarkets(),
  );

  if (!data) return null;
  return (
    <WatchedMarketsCardLoaded
      initial={data.markets}
      onReload={reload}
      // Keep the (persisted) query cache in step with what was saved. Left stale, coming
      // back to Settings showed the old markets, and the next toggle sent that old list,
      // undoing the earlier save.
      onSaved={(markets) => queryClient.setQueryData([QUERY_KEY], { markets })}
      error={error}
    />
  );
}

function WatchedMarketsCardLoaded({
  initial,
  onReload,
  onSaved,
  error,
}: {
  initial: Market[];
  onReload: () => void;
  onSaved: (markets: Market[]) => void;
  error: string | null;
}) {
  const { t, locale } = useLocale();
  const [markets, setMarkets] = useState<Market[]>(initial);
  const [blockedHint, setBlockedHint] = useState(false);

  const queue = useSaveQueue<Market[]>({
    initial,
    save: async (snapshot) => {
      const res = await client.settings.putWatchedMarkets({ markets: snapshot });
      onSaved(res.markets);
      return res.markets;
    },
    onError: (_err, rolledBackTo) => {
      setMarkets(rolledBackTo ?? initial);
      onReload();
    },
  });

  // A newer server value (the live refetch after a restored cache) replaces the shown
  // one, but never while a change of the user's is still waiting to save.
  const initialKey = initial.join(',');
  useEffect(() => {
    if (queue.flushing() || queue.pending() !== null) return;
    setMarkets(initialKey ? (initialKey.split(',') as Market[]) : []);
  }, [initialKey, queue]);

  const handleToggle = (market: Market, next: boolean) => {
    const result = toggleMarket(markets, market, next);
    if (result === null) {
      setBlockedHint(true);
      return;
    }
    setBlockedHint(false);
    setMarkets(result);
    queue.push(result);
  };

  const notice = blockedHint ? t('keepOneMarket') : error;

  return (
    <SettingsGroup name={t('watchedMarkets')}>
      {MARKET_ORDER.map((market) => (
        <SettingsRow key={market} label={marketLabel(market, locale)}>
          <Switch
            ariaLabel={marketLabel(market, locale)}
            checked={markets.includes(market)}
            onCheckedChange={(checked) => handleToggle(market, checked)}
          />
        </SettingsRow>
      ))}
      {notice ? <SettingsRow error={notice} /> : null}
    </SettingsGroup>
  );
}
