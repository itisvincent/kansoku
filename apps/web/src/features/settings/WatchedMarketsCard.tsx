import { useState } from 'react';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Switch } from '@web/ui';
import { marketLabel, type Market } from './types';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { toggleMarket } from './watchedMarkets';
import { useSaveQueue } from './useSaveQueue';
import { useLocale } from '../../lib/i18n';

const MARKET_ORDER: Market[] = ['US', 'HK', 'CN'];

export function WatchedMarketsCard() {
  const { data, error, reload } = useQuery<{ markets: Market[] }>(
    'settings.getWatchedMarkets',
    () => client.settings.getWatchedMarkets(),
  );

  if (!data) return null;
  return <WatchedMarketsCardLoaded initial={data.markets} onReload={reload} error={error} />;
}

function WatchedMarketsCardLoaded({
  initial,
  onReload,
  error,
}: {
  initial: Market[];
  onReload: () => void;
  error: string | null;
}) {
  const { t, locale } = useLocale();
  const [markets, setMarkets] = useState<Market[]>(initial);
  const [blockedHint, setBlockedHint] = useState(false);

  const queue = useSaveQueue<Market[]>({
    initial,
    save: async (snapshot) => {
      const res = await client.settings.putWatchedMarkets({ markets: snapshot });
      return res.markets;
    },
    onError: (_err, rolledBackTo) => {
      setMarkets(rolledBackTo ?? initial);
      onReload();
    },
  });

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
