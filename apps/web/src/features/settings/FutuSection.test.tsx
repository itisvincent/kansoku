// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FutuAccountOut } from '@kansoku/core/contract/settings';
import { translate } from '@web/lib/i18n';

const getFutu = vi.fn<() => Promise<FutuAccountOut>>();
const putFutu = vi.fn<(input: unknown) => Promise<FutuAccountOut>>();

vi.mock('@web/lib/client', () => ({
  client: { settings: { getFutu: () => getFutu(), putFutu: (input: unknown) => putFutu(input) } },
}));

const { FutuSection } = await import('./FutuSection');
const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('zh-CN', key, params);

function account(candles: 'longbridge' | 'futu'): FutuAccountOut {
  return {
    settings: { enabled: true, watchlist: false, candles, host: '127.0.0.1', port: 11111 },
    status: {
      enabled: true,
      state: 'connected',
      message: null,
      accounts: 2,
      positions: 21,
      watchlist: null,
      historyQuota: { used: 15, remaining: 285 },
    },
  };
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FutuSection />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  getFutu.mockReset();
  putFutu.mockReset();
});

describe('FutuSection price history source', () => {
  it('shows the remaining Futu history quota', async () => {
    getFutu.mockResolvedValue(account('longbridge'));
    renderSection();
    expect(
      await screen.findByText(new RegExp(t('futuHistoryQuota', { remaining: 285, total: 300 }))),
    ).toBeTruthy();
  });

  it('saves Futu as the first source', async () => {
    getFutu.mockResolvedValue(account('longbridge'));
    putFutu.mockResolvedValue(account('futu'));
    renderSection();
    fireEvent.click(await screen.findByText(t('futuCandlesFutu')));
    await waitFor(() => expect(putFutu).toHaveBeenCalledWith({ candles: 'futu' }));
  });
});
