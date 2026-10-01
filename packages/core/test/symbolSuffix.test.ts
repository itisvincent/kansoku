import { describe, expect, it } from 'vitest';
import { normalizeSymbol, withMarketSuffix } from '../src/symbols/symbol.utils.js';

describe('market suffixes', () => {
  it('adds .US to a share-class ticker and to an index', () => {
    expect(normalizeSymbol('brk.b')).toBe('BRK.B.US');
    expect(normalizeSymbol('.VIX')).toBe('.VIX.US');
  });

  it('keeps a symbol that already names its market', () => {
    expect(normalizeSymbol('MU')).toBe('MU.US');
    expect(normalizeSymbol('700.hk')).toBe('700.HK');
    expect(normalizeSymbol('BRK.B.US')).toBe('BRK.B.US');
    expect(normalizeSymbol('.SOX.US')).toBe('.SOX.US');
    expect(withMarketSuffix('btc.has')).toBe('BTC.HAS');
  });
});
