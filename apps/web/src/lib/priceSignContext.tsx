import { createContext, use, type ReactNode } from 'react';
import { priceSign } from './format';

const PriceSignContext = createContext('$');

/** Prices inside are shown in the given symbol's currency ("HK$" for a Hong Kong stock). */
export function PriceSignProvider({ symbol, children }: { symbol: string; children: ReactNode }) {
  return <PriceSignContext value={priceSign(symbol)}>{children}</PriceSignContext>;
}

/** The currency sign for the stock on screen; "$" outside a stock page. */
export function usePriceSign(): string {
  return use(PriceSignContext);
}
