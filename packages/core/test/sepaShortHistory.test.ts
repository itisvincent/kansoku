import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSepa, type SepaInput } from '../src/analysis/sepa.js';

const input = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'sepa-input.json'), 'utf8'),
) as SepaInput & { kline: unknown[] };

describe('SEPA checks on a stock with a short history', () => {
  it('marks checks that need a missing average as unknown instead of pass/fail', () => {
    const young = { ...input, kline: input.kline.slice(-120) } as SepaInput;
    const { built } = buildSepa(young);
    const checks = built.sidebar.checks;
    for (const i of [0, 1, 2, 3]) {
      expect(checks[i].status).toBe('unknown');
      expect(checks[i].val).toContain('120');
    }
    // The 50-day average exists, so price-vs-50MA is still judged.
    expect(checks[4].status).not.toBe('unknown');
  });
});
