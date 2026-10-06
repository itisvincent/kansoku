import { describe, expect, it } from 'vitest';
import { createRateGate, isRateLimited } from '../src/marketdata/rateGate.js';

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('createRateGate', () => {
  it('runs calls one at a time, at least the interval apart', async () => {
    const clock = fakeClock();
    const gate = createRateGate({ minIntervalMs: 1100, ...clock });
    const starts: number[] = [];
    let running = 0;
    let maxRunning = 0;
    const call = () =>
      gate.run(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        starts.push(clock.now());
        await clock.sleep(10);
        running -= 1;
        return starts.length;
      });
    const results = await Promise.all([call(), call(), call()]);
    expect(results).toEqual([1, 2, 3]);
    expect(maxRunning).toBe(1);
    expect(starts).toEqual([0, 1100, 2200]);
  });

  it('waits and retries a rate-limited call, then succeeds', async () => {
    const clock = fakeClock();
    const gate = createRateGate({ minIntervalMs: 1100, retries: 2, ...clock });
    let attempts = 0;
    const value = await gate.run(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('openapi error: code=429002: rate limit of 1-second interval has been reached');
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('gives up after the retries and passes the error on', async () => {
    const gate = createRateGate({ minIntervalMs: 1100, retries: 1, ...fakeClock() });
    await expect(
      gate.run(async () => {
        throw new Error('code=429002 rate limit');
      }),
    ).rejects.toThrow('429002');
  });

  it('does not retry other errors, and keeps the queue moving after one', async () => {
    const gate = createRateGate({ minIntervalMs: 1100, retries: 2, ...fakeClock() });
    let attempts = 0;
    await expect(
      gate.run(async () => {
        attempts += 1;
        throw new Error('not logged in');
      }),
    ).rejects.toThrow('not logged in');
    expect(attempts).toBe(1);
    expect(await gate.run(async () => 'next')).toBe('next');
  });
});

describe('isRateLimited', () => {
  it('recognises Longbridge rate-limit errors only', () => {
    expect(isRateLimited(new Error('openapi error: code=429002: rate limit of 1-second interval'))).toBe(true);
    expect(isRateLimited(new Error('history candlestick symbol count out of limit'))).toBe(false);
    expect(isRateLimited('not an error')).toBe(false);
  });
});
