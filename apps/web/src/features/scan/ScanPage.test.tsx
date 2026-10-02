// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScanSetup, WatchlistScanState } from '@kansoku/shared/types';
import { translate } from '@web/lib/i18n';

const scanStatus = vi.fn();
const scanStart = vi.fn();
const scanCancel = vi.fn();
const scanRerunFailed = vi.fn();
vi.mock('@web/lib/client', () => ({
  client: {
    overview: {
      scanStatus: (...args: unknown[]) => scanStatus(...args),
      scanStart: (...args: unknown[]) => scanStart(...args),
      scanCancel: (...args: unknown[]) => scanCancel(...args),
      scanRerunFailed: (...args: unknown[]) => scanRerunFailed(...args),
    },
  },
}));

const { ScanPage } = await import('./ScanPage');
const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('zh-CN', key, params);

function setup(symbol: string, score: number, direction: ScanSetup['direction'] = 'long'): ScanSetup {
  return {
    symbol,
    chart_id: `chart-${symbol}`,
    direction,
    conviction: 70,
    entry: 100,
    stop: 95,
    target1: 110,
    reward_risk: 2,
    range_low: direction === 'neutral' ? 90 : null,
    range_high: direction === 'neutral' ? 110 : null,
    score,
  };
}

function state(overrides: Partial<WatchlistScanState> = {}): WatchlistScanState {
  return {
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
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ScanPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  scanStatus.mockReset();
  scanStart.mockReset();
  scanCancel.mockReset();
  scanRerunFailed.mockReset();
});

const item = (symbol: string) => ({
  symbol,
  status: 'done' as const,
  chart_id: `chart-${symbol}`,
  reason: null,
  started_at: null,
  finished_at: null,
});

describe('ScanPage', () => {
  it('shows only the top three setups in the top list', async () => {
    const setups = [setup('A.US', 3), setup('B.US', 2), setup('C.US', 1.5), setup('D.US', 1)];
    scanStatus.mockResolvedValue(
      state({ finished_at: '2026-09-28T15:00:00.000Z', items: setups.map((s) => item(s.symbol)), setups }),
    );
    const { container } = renderPage();
    await screen.findByText(t('scanTop'));
    const lists = container.querySelectorAll('.scan-setups');
    expect(lists[0].querySelectorAll('.scan-setup-row')).toHaveLength(3);
    expect(lists[1].querySelectorAll('.scan-setup-row')).toHaveLength(4);
  });

  it('asks for confirmation, then starts with the saved analysis windows and pinned anchor', async () => {
    localStorage.setItem('intraday-analysis-tfs', JSON.stringify(['h1', '4h', 'day']));
    localStorage.setItem('cockpit-anchor-choice', 'day');
    scanStatus.mockResolvedValue(state());
    scanStart.mockResolvedValue({ started: true });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: t('scanStart') }));
    expect(scanStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('scanConfirm') }));
    await waitFor(() =>
      expect(scanStart).toHaveBeenCalledWith({ timeframes: ['h1', '4h', 'day'], anchorTf: 'day' }),
    );
  });

  it('leaves the anchor to the AI when the picker follows the chart', async () => {
    localStorage.setItem('cockpit-anchor-choice', 'auto');
    scanStatus.mockResolvedValue(state());
    scanStart.mockResolvedValue({ started: true });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: t('scanStart') }));
    fireEvent.click(screen.getByRole('button', { name: t('scanConfirm') }));
    await waitFor(() => expect(scanStart).toHaveBeenCalled());
    expect(scanStart.mock.calls[0][0]).not.toHaveProperty('anchorTf');
  });

  it('explains why a scan did not start', async () => {
    scanStatus.mockResolvedValue(state());
    scanStart.mockResolvedValue({ started: false, reason: 'analyst layer disabled' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: t('scanStart') }));
    fireEvent.click(screen.getByRole('button', { name: t('scanConfirm') }));
    expect(await screen.findByText(t('scanReasonUnconfigured'))).toBeTruthy();
  });

  it('offers stop while a scan is running', async () => {
    scanStatus.mockResolvedValue(
      state({
        running: true,
        items: [{ ...item('A.US'), status: 'running', chart_id: null }],
      }),
    );
    scanCancel.mockResolvedValue(state());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: t('scanStop') }));
    await waitFor(() => expect(scanCancel).toHaveBeenCalled());
    expect(screen.getByText(t('scanProgress', { done: 0, total: 1 }))).toBeTruthy();
  });

  it('lists range calls apart from ranked setups', async () => {
    scanStatus.mockResolvedValue(
      state({ items: [item('R.US')], ranges: [setup('R.US', 0, 'neutral')] }),
    );
    renderPage();
    expect(await screen.findByText(t('scanRanges'))).toBeTruthy();
    expect(screen.getByText(t('scanNoSetups'))).toBeTruthy();
  });

  it('re-runs only what failed or did not finish, after confirming', async () => {
    scanStatus.mockResolvedValue(
      state({
        scope: 'positions',
        items: [
          item('NVDA.US'),
          { ...item('UBER.US'), status: 'failed', chart_id: null },
          { ...item('MCD.US'), status: 'cancelled', chart_id: null, reason: 'app closed before it finished' },
        ],
      }),
    );
    scanRerunFailed.mockResolvedValue({ started: true });
    renderPage();
    expect(await screen.findByText(t('scanItemInterrupted'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('scanRerunFailed', { count: 2 }) }));
    expect(screen.getByText(t('scanRerunHint', { count: 2 }))).toBeTruthy();
    expect(scanRerunFailed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('scanRerunConfirm') }));
    await waitFor(() => expect(scanRerunFailed).toHaveBeenCalledTimes(1));
    expect(scanStart).not.toHaveBeenCalled();
  });

  it('runs the last scan again with its own scope and windows', async () => {
    localStorage.setItem('intraday-analysis-tfs', JSON.stringify(['day']));
    scanStatus.mockResolvedValue(
      state({ scope: 'positions', timeframes: ['h1', '4h'], anchor_tf: '4h', items: [item('NVDA.US')] }),
    );
    scanStart.mockResolvedValue({ started: true });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: t('scanAgain') }));
    fireEvent.click(screen.getByRole('button', { name: t('scanAgainConfirm') }));
    await waitFor(() =>
      expect(scanStart).toHaveBeenCalledWith({
        timeframes: ['h1', '4h'],
        anchorTf: '4h',
        scope: 'positions',
      }),
    );
  });

  it('hides re-run and run-again when there is nothing to repeat', async () => {
    scanStatus.mockResolvedValue(state());
    renderPage();
    await screen.findByRole('button', { name: t('scanStart') });
    expect(screen.queryByRole('button', { name: t('scanAgain') })).toBeNull();
    expect(screen.queryByText(/重跑失败/)).toBeNull();
  });
});
