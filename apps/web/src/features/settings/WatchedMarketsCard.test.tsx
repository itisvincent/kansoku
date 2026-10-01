// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '@web/lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getWatchedMarkets = vi.fn();
const putWatchedMarkets = vi.fn();
vi.mock('@web/lib/client', () => ({
  client: {
    settings: {
      getWatchedMarkets: (...args: unknown[]) => getWatchedMarkets(...args),
      putWatchedMarkets: (...args: unknown[]) => putWatchedMarkets(...args),
    },
  },
}));

const { WatchedMarketsCard } = await import('./WatchedMarketsCard');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WatchedMarketsCard', () => {
  it('writes a saved change into the query cache so returning to Settings shows it', async () => {
    getWatchedMarkets.mockResolvedValue({ markets: ['US'] });
    putWatchedMarkets.mockImplementation(async ({ markets }: { markets: string[] }) => ({ markets }));
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <WatchedMarketsCard />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    const switches = await screen.findAllByRole('switch');
    fireEvent.click(switches[1]); // turn on the second market (HK)
    await waitFor(() => expect(putWatchedMarkets).toHaveBeenCalled());
    await waitFor(() =>
      expect(queryClient.getQueryData(['settings.getWatchedMarkets'])).toEqual({
        markets: ['US', 'HK'],
      }),
    );
  });
});
