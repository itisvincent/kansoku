import { describe, expect, it } from 'vitest';
import { usesOpencli, withOpencliLock } from '../src/credentials/opencliLock.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('withOpencliLock', () => {
  it('runs opencli work one at a time, in order, even when one fails', async () => {
    let active = 0;
    let peak = 0;
    const order: string[] = [];
    const job = (name: string, fail = false) => () =>
      (async () => {
        active += 1;
        peak = Math.max(peak, active);
        order.push(`start ${name}`);
        await tick();
        order.push(`end ${name}`);
        active -= 1;
        if (fail) throw new Error(name);
        return name;
      })();
    const results = await Promise.allSettled([
      withOpencliLock(job('a')),
      withOpencliLock(job('b', true)),
      withOpencliLock(job('c')),
    ]);
    expect(peak).toBe(1);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});

describe('usesOpencli', () => {
  it('spots opencli in a shell command', () => {
    expect(usesOpencli('opencli twitter search "$NVDA" --limit 20')).toBe(true);
    expect(usesOpencli('cd x && /e/pnpm/opencli.CMD twitter profile')).toBe(true);
    expect(usesOpencli('longbridge quote NVDA.US')).toBe(false);
    expect(usesOpencli('cat notes/opencliffs.md')).toBe(false);
  });
});
