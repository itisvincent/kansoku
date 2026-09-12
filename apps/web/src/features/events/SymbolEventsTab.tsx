import { useLocale } from '../../lib/i18n';
import type { MarketEvent } from '@kansoku/shared/types';
import { shortSymbol } from './eventLabels';
import { MarketEventTape } from './MarketEventTape';
import { useMarketEventFeed } from './useMarketEventFeed';

export function SymbolEventsTab({
  symbol,
  onGenerateCanvas,
}: {
  symbol: string;
  onGenerateCanvas?: (event: MarketEvent) => void;
}) {
  const { t } = useLocale();
  const feed = useMarketEventFeed({ symbol, live: true });
  return (
    <MarketEventTape
      emptyText={t('eventSymbolEmpty', { symbol: shortSymbol(symbol) })}
      feed={feed}
      onGenerateCanvas={onGenerateCanvas}
    />
  );
}
