import { describe, expect, it } from 'vitest';
import { priceSign } from './format';

describe('priceSign', () => {
  it('signs each market in its own currency', () => {
    expect(priceSign('NVDA.US')).toBe('$');
    expect(priceSign('0700.HK')).toBe('HK$');
    expect(priceSign('600519.SH')).toBe('¥');
    expect(priceSign('000001.SZ')).toBe('¥');
    expect(priceSign('D05.SG')).toBe('S$');
  });

  it('falls back to $ without a symbol or market', () => {
    expect(priceSign(undefined)).toBe('$');
    expect(priceSign('')).toBe('$');
    expect(priceSign('NVDA')).toBe('$');
  });
});
