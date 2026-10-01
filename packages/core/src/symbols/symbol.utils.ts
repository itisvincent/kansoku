import { ClientError } from '../platform/errors.js';

const SYMBOL_RE = /^[\d.A-Z]+$/;
const NOTE_NAME_RE = /^[\d.A-Z_-]+$/;

export type Market = 'US' | 'HK' | 'CN';

export function marketOf(symbol: string): Market {
  const sym = symbol.trim().toUpperCase();
  if (sym.endsWith('.HK')) return 'HK';
  if (sym.endsWith('.SH') || sym.endsWith('.SZ')) return 'CN';
  return 'US';
}

/**
 * Whether a symbol already names its market (MU.US, 700.HK, BTC.HAS). A one-letter tail
 * is a share class (BRK.B, BF.A) and a leading dot is an index (.VIX); neither is a
 * market, so those still need ".US".
 */
export function hasMarketSuffix(symbol: string): boolean {
  const dot = symbol.lastIndexOf('.');
  return dot > 0 && symbol.length - dot - 1 >= 2;
}

/** Upper-cases a symbol and adds ".US" when it names no market. */
export function withMarketSuffix(raw: string): string {
  const sym = raw.trim().toUpperCase();
  return hasMarketSuffix(sym) ? sym : `${sym}.US`;
}

export function normalizeSymbol(raw: string): string {
  const sym = withMarketSuffix(raw);
  if (!SYMBOL_RE.test(sym)) {
    throw new ClientError(`invalid symbol: ${raw}`, 'e.g. MU or MU.US');
  }
  return sym;
}

export function noteFileName(raw: string): string {
  const name = raw.trim().replace(/\.us$/i, '').toUpperCase();
  if (!NOTE_NAME_RE.test(name) || name.includes('..')) {
    throw new ClientError(`invalid symbol: ${raw}`, 'expected a plain ticker like MU or MU.US');
  }
  return name;
}
