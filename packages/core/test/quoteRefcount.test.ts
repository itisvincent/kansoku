import { describe, expect, it, vi } from 'vitest';

const refs = new Map<string, number>();
vi.mock('../src/marketdata/streamRouting.js', () => ({
  distinctStreams: () => [{ onUpdate: () => () => {} }],
  retainSymbols: async (symbols: string[]) => {
    for (const s of symbols) refs.set(s, (refs.get(s) ?? 0) + 1);
  },
  releaseSymbols: async (symbols: string[]) => {
    for (const s of symbols) refs.set(s, (refs.get(s) ?? 0) - 1);
  },
}));
vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => ({
    getWatchlistSymbols: async () => ['NVDA.US', 'MU.US'],
    getPositions: async () => [],
  }),
  getStream: () => ({ getSnapshot: () => undefined }),
}));

const { subscribeQuotes } = await import('../src/realtime/quotes.js');
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('quote subscriptions', () => {
  it('releases every watchlist symbol after the last viewer leaves', async () => {
    const stop = subscribeQuotes(() => {});
    await settle();
    expect(refs.get('NVDA.US')).toBe(1);
    stop();
    await settle();
    expect(refs.get('NVDA.US')).toBe(0);
    expect(refs.get('MU.US')).toBe(0);
  });
});
