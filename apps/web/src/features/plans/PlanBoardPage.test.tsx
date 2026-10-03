// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanBoard, PlanBoardRow, QuoteSnapshot } from '@kansoku/shared/types';
import { translate } from '@web/lib/i18n';

const plans = vi.fn<() => Promise<PlanBoard>>();
let liveQuotes: QuoteSnapshot | null = null;

vi.mock('@web/lib/client', () => ({
  client: { positions: { plans: () => plans() } },
}));
vi.mock('@web/lib/ws/useWsChannel', () => ({
  useWsChannel: (spec: unknown, onData: (data: QuoteSnapshot) => void) => {
    if (spec && liveQuotes) queueMicrotask(() => onData(liveQuotes as QuoteSnapshot));
    return { degraded: false, connected: true, snapshotAt: null };
  },
}));

const { PlanBoardPage } = await import('./PlanBoardPage');
const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('zh-CN', key, params);

function row(symbol: string, price: number, plan: Partial<NonNullable<PlanBoardRow['plan']>> | null) {
  return {
    symbol,
    name: `${symbol} Inc`,
    quantity: 10,
    market_value: price * 10,
    price,
    plan: plan
      ? {
          chart_id: `${symbol}-1`,
          made_at: '2026-10-02T12:00:00Z',
          anchor_year: 'FY2027',
          targets: { bear: 120, base: 150, bull: 180 },
          bands: [],
          next_earnings: null,
          freshness: { state: 'fresh' as const },
          ...plan,
        }
      : null,
  } satisfies PlanBoardRow;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlanBoardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  plans.mockReset();
  liveQuotes = null;
});

describe('PlanBoardPage', () => {
  it('lists holdings closest to a level first, with live prices', async () => {
    plans.mockResolvedValue({
      generated_at: '2026-10-03T14:00:00Z',
      rows: [
        row('FAR.US', 100, { bands: [{ label: 'Add', price: 60 }, { label: 'Trim', price: 160 }] }),
        row('INTC.US', 140, {
          bands: [
            { label: 'Add', price: 129.17 },
            { label: 'Trim 1', price: 150.32 },
            { label: 'Thesis stop', price: 120.26 },
          ],
        }),
        row('NONE.US', 50, null),
      ],
    });
    liveQuotes = { ts: 0, quotes: [{ symbol: 'INTC.US', session: '日盘', last: 130, pct: 0, regularLast: 130, regularPct: 0 }] };
    const { container } = renderPage();
    await screen.findByText('INTC');
    await screen.findByText('$130.00');

    const rows = [...container.querySelectorAll('.plan-board-row')];
    expect(rows.map((r) => r.querySelector('a')?.textContent)).toEqual(['INTC', 'FAR', 'NONE']);
    expect(rows[0].getAttribute('data-near')).toBe('true');
    expect(within(rows[0] as HTMLElement).getByText(/Add \$129\.17/)).toBeTruthy();
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/symbol/INTC.US?analysis=INTC.US-1');
    expect(within(rows[2] as HTMLElement).getByText(t('plansNoPlan'))).toBeTruthy();
  });

  it('flags plans that need a re-run', async () => {
    plans.mockResolvedValue({
      generated_at: '2026-10-03T14:00:00Z',
      rows: [
        row('IBM.US', 100, {
          bands: [{ label: 'Add', price: 90 }],
          freshness: { state: 'stale', reason: 'earnings', date: '2026-10-01' },
        }),
      ],
    });
    renderPage();
    expect(await screen.findByText(t('plansStaleEarnings', { date: '2026-10-01' }))).toBeTruthy();
    expect(screen.getByText(new RegExp(t('plansSummaryStale', { count: 1 })))).toBeTruthy();
  });

  it('shows an empty note when there are no holdings', async () => {
    plans.mockResolvedValue({ generated_at: '2026-10-03T14:00:00Z', rows: [] });
    renderPage();
    expect(await screen.findByText(t('plansEmpty'))).toBeTruthy();
  });
});

describe('PlanBoardPage below the stop and outside the US', () => {
  it('warns instead of showing an add zone when the price is below the thesis stop', async () => {
    plans.mockResolvedValue({
      generated_at: '2026-10-03T14:00:00Z',
      rows: [
        row('BROKEN.US', 75, {
          bands: [
            { label: 'Add', price: 100 },
            { label: 'Thesis stop', price: 80 },
          ],
        }),
      ],
    });
    renderPage();
    expect(await screen.findByText(t('plansStopBroken'))).toBeTruthy();
    expect(screen.queryByText(t('plansInAddZone'))).toBeNull();
  });

  it('shows Hong Kong prices in HK dollars', async () => {
    plans.mockResolvedValue({
      generated_at: '2026-10-03T14:00:00Z',
      rows: [row('5.HK', 149.5, { bands: [{ label: 'Add', price: 132 }] })],
    });
    renderPage();
    expect(await screen.findByText('HK$149.50')).toBeTruthy();
  });
});
