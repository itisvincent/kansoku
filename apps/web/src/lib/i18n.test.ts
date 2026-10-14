import { describe, expect, it } from 'vitest';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

function extractPlaceholders(message: string): string[] {
  const matches = message.match(/\{(\w+)\}/g) ?? [];
  return [...new Set(matches)].sort();
}

describe('locale placeholder parity', () => {
  it('every key uses the same {placeholders} in zh-CN and en-US', () => {
    const mismatches: string[] = [];

    for (const key of Object.keys(zhCN) as (keyof typeof zhCN)[]) {
      const zhPlaceholders = extractPlaceholders(zhCN[key]);
      const enPlaceholders = extractPlaceholders(enUS[key]);

      if (zhPlaceholders.join(',') !== enPlaceholders.join(',')) {
        mismatches.push(
          `"${key}": zh-CN has [${zhPlaceholders.join(', ')}], en-US has [${enPlaceholders.join(', ')}]`,
        );
      }
    }

    expect(mismatches, `Placeholder mismatch in ${mismatches.length} key(s):\n${mismatches.join('\n')}`).toHaveLength(0);
  });
});
