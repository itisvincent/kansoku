import { describe, expect, it } from 'vitest';
import { isMacPlatform } from './windowChrome';

describe('isMacPlatform', () => {
  it('tells macOS from Windows and Linux', () => {
    expect(isMacPlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32', userAgent: '' })).toBe(false);
    expect(isMacPlatform({ platform: '', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
  });
});
