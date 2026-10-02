// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@web/lib/i18n';

const refresh = vi.fn();
const scanStart = vi.fn();
const scanStatus = vi.fn();
vi.mock('@web/lib/client', () => ({
  client: {
    positions: { refresh: (...args: unknown[]) => refresh(...args) },
    overview: {
      scanStart: (...args: unknown[]) => scanStart(...args),
      scanStatus: (...args: unknown[]) => scanStatus(...args),
    },
  },
}));

const { PositionsActions } = await import('./PositionsActions');

const idle = {
  running: false,
  scope: 'watchlist',
  started_at: null,
  finished_at: null,
  timeframes: [],
  anchor_tf: null,
  items: [],
  setups: [],
  ranges: [],
  skipped_over_cap: 0,
};

function renderActions(count = 21) {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <PositionsActions count={count} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PositionsActions', () => {
  it('refreshes positions past the caches and puts the answer in the positions query', async () => {
    scanStatus.mockResolvedValue(idle);
    refresh.mockResolvedValue({ positions: [{ symbol: 'NVDA.US' }] });
    const queryClient = renderActions();
    fireEvent.click(await screen.findByTitle('Refresh'));
    await waitFor(() =>
      expect(queryClient.getQueryData(['positions.list'])).toEqual({
        positions: [{ symbol: 'NVDA.US' }],
      }),
    );
  });

  it('asks before analysing every position, then starts a positions scan', async () => {
    scanStatus.mockResolvedValue(idle);
    scanStart.mockResolvedValue({ started: true });
    renderActions(21);
    fireEvent.click(await screen.findByText('Analyze all positions'));
    expect(screen.getByText(/Analyze all 21 positions\?/)).toBeTruthy();
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(scanStart).toHaveBeenCalled());
    expect(scanStart.mock.calls[0][0]).toMatchObject({ scope: 'positions' });
  });

  it('says why it could not start', async () => {
    scanStatus.mockResolvedValue(idle);
    scanStart.mockResolvedValue({ started: false, reason: 'positions unavailable' });
    renderActions();
    fireEvent.click(await screen.findByText('Analyze all positions'));
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText(/Could not read your positions/)).toBeTruthy();
  });

  it('shows progress while a positions scan runs', async () => {
    scanStatus.mockResolvedValue({
      ...idle,
      running: true,
      scope: 'positions',
      items: [
        { symbol: 'A', status: 'done' },
        { symbol: 'B', status: 'running' },
        { symbol: 'C', status: 'queued' },
      ],
    });
    renderActions();
    expect(await screen.findByText(/Analyzing positions… 1\/3/)).toBeTruthy();
  });
});
