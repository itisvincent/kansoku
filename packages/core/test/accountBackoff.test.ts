import { describe, expect, it, vi } from 'vitest';
import { createLongbridgeProvider } from '../src/marketdata/longbridge.js';
import { FUTU_RETRY_MS, withFutu } from '../src/marketdata/futu/withFutu.js';
import { resetAccountCaches } from '../src/marketdata/accountRefresh.js';
import type { MarketDataProvider } from '../src/marketdata/types.js';

const scopeError = () =>
  new Error('API error (code 403308): Target API scope is not in authorized scopes');

describe('Longbridge without the account permission', () => {
  it('asks the CLI once, then answers from memory with a plain message', async () => {
    const run = vi.fn(async () => {
      throw scopeError();
    });
    const provider = createLongbridgeProvider(run as never);
    await expect(provider.getPositions!()).rejects.toThrow(/permission \(code 403308\)/);
    await expect(provider.getPositions!()).rejects.toThrow(/403308/);
    await expect(provider.getPortfolio!()).rejects.toThrow(/403308/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('asks again after a refresh', async () => {
    const run = vi.fn(async () => {
      throw scopeError();
    });
    const provider = createLongbridgeProvider(run as never);
    await expect(provider.getPositions!()).rejects.toThrow();
    resetAccountCaches();
    await expect(provider.getPositions!()).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('Futu while OpenD is down', () => {
  function setup() {
    let clock = 1_000_000;
    const account = vi.fn(async () => {
      throw new Error('OpenD is not reachable on 127.0.0.1:11111 (ECONNREFUSED)');
    });
    const warn = vi.fn();
    const base = {
      getPositions: async () => {
        throw scopeError();
      },
    } as unknown as MarketDataProvider;
    const provider = withFutu(base, {
      settings: () => ({ enabled: true, watchlist: false, host: '127.0.0.1', port: 11111 }),
      account,
      watchlist: async () => [],
      warn,
      now: () => clock,
    });
    return { provider, account, warn, advance: (ms: number) => (clock += ms) };
  }

  it('tries OpenD once per 30 seconds and logs the failure once', async () => {
    const { provider, account, warn, advance } = setup();
    for (let i = 0; i < 5; i++) await provider.getPositions!().catch(() => {});
    expect(account).toHaveBeenCalledTimes(1);
    advance(FUTU_RETRY_MS + 1);
    await provider.getPositions!().catch(() => {});
    expect(account).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('says to log in to OpenD when neither broker answers', async () => {
    const { provider } = setup();
    await expect(provider.getPositions!()).rejects.toThrow(/Futu OpenD is not reachable/);
  });

  it('tries OpenD straight away after a refresh', async () => {
    const { provider, account } = setup();
    await provider.getPositions!().catch(() => {});
    resetAccountCaches();
    await provider.getPositions!().catch(() => {});
    expect(account).toHaveBeenCalledTimes(2);
  });
});
