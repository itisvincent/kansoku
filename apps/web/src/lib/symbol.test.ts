import { describe, expect, it } from 'vitest';
import { normalizeSymbol, symbolFromRoute } from './symbol';

describe('normalizeSymbol', () => {
  it('uppercases a bare ticker and appends .US when no market suffix is present', () => {
    expect(normalizeSymbol('avgo')).toBe('AVGO.US');
  });

  it('uppercases a bare uppercase ticker and appends .US', () => {
    expect(normalizeSymbol('NVDA')).toBe('NVDA.US');
  });

  it('preserves an existing HK suffix', () => {
    expect(normalizeSymbol('700.HK')).toBe('700.HK');
  });

  it('preserves an existing US suffix', () => {
    expect(normalizeSymbol('MU.US')).toBe('MU.US');
  });

  it('preserves suffix on a lowercase input with market', () => {
    expect(normalizeSymbol('tsm.us')).toBe('TSM.US');
  });

  it('returns null for an empty string', () => {
    expect(normalizeSymbol('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(normalizeSymbol('   ')).toBeNull();
  });

  it('returns null when the symbol contains invalid characters', () => {
    expect(normalizeSymbol('AAPL!')).toBeNull();
    expect(normalizeSymbol('a b c')).toBeNull();
  });

  it('today behaviour: BRK.B is treated as already carrying a suffix (no .US appended)', () => {
    // The dot in BRK.B is seen as a market separator by the current logic,
    // so the result is BRK.B, not BRK.B.US. Noted in PR as a known quirk.
    expect(normalizeSymbol('BRK.B')).toBe('BRK.B');
  });
});

describe('symbolFromRoute', () => {
  it('extracts and normalizes a symbol from a plain /symbol/ route', () => {
    expect(symbolFromRoute('/symbol/AAPL.US')).toBe('AAPL.US');
  });

  it('appends .US when the path segment has no market suffix', () => {
    expect(symbolFromRoute('/symbol/avgo')).toBe('AVGO.US');
  });

  it('strips a query string before extracting the symbol', () => {
    expect(symbolFromRoute('/symbol/MU.US?analysis=2026-10-10-mu')).toBe('MU.US');
    expect(symbolFromRoute('/symbol/tsm?view=live')).toBe('TSM.US');
  });

  it('decodes a percent-encoded symbol segment', () => {
    // %2E is a percent-encoded dot
    expect(symbolFromRoute('/symbol/AVGO%2EUS')).toBe('AVGO.US');
  });

  it('returns null for a broken percent-escape sequence', () => {
    expect(symbolFromRoute('/symbol/%ZZ')).toBeNull();
  });

  it('returns null for /symbol/sepa/X (extra path segment is not a valid symbol)', () => {
    expect(symbolFromRoute('/symbol/sepa/AAPL.US')).toBeNull();
  });

  it('returns null for non-symbol routes', () => {
    expect(symbolFromRoute('/scan')).toBeNull();
    expect(symbolFromRoute('/settings')).toBeNull();
    expect(symbolFromRoute('/')).toBeNull();
  });
});
