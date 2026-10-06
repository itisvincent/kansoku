const group = (x: number, d: number) =>
  x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = (x: number, d = 2) => group(x, d);

export const signed = (x: number, d = 2) => (x >= 0 ? '+' : '') + group(x, d);

export const money = (x: number, d = 2) => `$${group(x, d)}`;

export const upDown = (x: number) => (x >= 0 ? 'up' : 'down');

const PRICE_SIGNS: Record<string, string> = { HK: 'HK$', SH: '¥', SZ: '¥', SG: 'S$' };

/** The currency sign a symbol is priced in, from its market suffix ("700.HK" → "HK$"). */
export const priceSign = (symbol: string | null | undefined): string =>
  PRICE_SIGNS[symbol?.split('.').at(-1)?.toUpperCase() ?? ''] ?? '$';
