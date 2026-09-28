// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PredictionScorecard, StatsBucket } from '@kansoku/shared/types';
import { translate } from '@web/lib/i18n';

const scorecard = vi.fn();
vi.mock('@web/lib/client', () => ({
  client: { overview: { scorecard: (...args: unknown[]) => scorecard(...args) } },
}));

const { ScorecardPage } = await import('./ScorecardPage');
const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('zh-CN', key, params);

function bucket(overrides: Partial<StatsBucket> = {}): StatsBucket {
  return {
    total: 0,
    hit_target: 0,
    hit_stop: 0,
    held_range: 0,
    broke_range: 0,
    open: 0,
    unjudged: 0,
    win_rate: null,
    avg_pct: null,
    avg_r: null,
    ...overrides,
  };
}

function card(overrides: Partial<PredictionScorecard> = {}): PredictionScorecard {
  return {
    since: null,
    total: 8,
    overall: bucket({ total: 8, hit_target: 5, hit_stop: 2, open: 1, win_rate: 5 / 7, avg_r: 0.8 }),
    by_anchor: [
      { key: 'h1', bucket: bucket({ total: 6, hit_target: 4, hit_stop: 2, win_rate: 4 / 6 }) },
      { key: '4h', bucket: bucket({ total: 2, hit_target: 1, open: 1, win_rate: 1 }) },
    ],
    by_direction: [{ key: 'long', bucket: bucket({ total: 8, hit_target: 5, win_rate: 0.7 }) }],
    by_windows: [{ key: 'unknown', bucket: bucket({ total: 8 }) }],
    recent: [
      {
        chart_id: '2026-09-25-mu',
        symbol: 'MU.US',
        created_at: '2026-09-25T14:00:00.000Z',
        url: 'http://localhost/charts/2026-09-25-mu',
        direction: 'long',
        anchor_tf: '4h',
        windows: ['h1', '4h', 'day'],
        conviction: 70,
        outcome: { status: 'hit_target', pct_since_anchor: 4.2, resolved_at: 1 },
      },
    ],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ScorecardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  scorecard.mockReset();
});

describe('ScorecardPage', () => {
  it('shows the hit rate split by anchor timeframe', async () => {
    scorecard.mockResolvedValue(card());
    renderPage();
    expect(await screen.findByText(t('scorecardByAnchor'))).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
    expect(screen.getAllByText(t('scorecardUnknown')).length).toBeGreaterThan(0);
    expect(screen.getByText('MU')).toBeTruthy();
    expect(screen.getByText('70')).toBeTruthy();
  });

  it('dims groups with too few settled predictions', async () => {
    scorecard.mockResolvedValue(card());
    const { container } = renderPage();
    await screen.findByText(t('scorecardByAnchor'));
    const thin = container.querySelectorAll('tr[data-thin="true"]');
    // The 4h group has one settled call, below the five-call threshold.
    expect(thin.length).toBeGreaterThan(0);
  });

  it('asks for the last 90 days by default and refetches for all time', async () => {
    scorecard.mockResolvedValue(card());
    renderPage();
    await waitFor(() => expect(scorecard).toHaveBeenCalledWith({ days: 90 }));
    fireEvent.click(screen.getByLabelText(t('scorecardAllTime')));
    await waitFor(() => expect(scorecard).toHaveBeenLastCalledWith({}));
    expect(localStorage.getItem('scorecard-period')).toBe('all');
  });

  it('explains an empty period', async () => {
    scorecard.mockResolvedValue(card({ total: 0, recent: [], by_anchor: [], by_direction: [], by_windows: [] }));
    renderPage();
    expect(await screen.findByText(t('scorecardEmpty'))).toBeTruthy();
  });
});
