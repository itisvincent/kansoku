import { describe, expect, it, vi } from 'vitest';
import type { Notice } from '@kansoku/shared/types';
import type { PlanBand } from '@kansoku/shared/planLevels';
import { createPlanAlerts, type PlanAlertDeps } from '../src/plans/planAlerts.js';

type PriceListener = (symbol: string, price: number, session: string) => void;

function harness(plans: Record<string, PlanBand[]>, overrides: Partial<PlanAlertDeps> = {}) {
  const notices: Notice[] = [];
  let listener: PriceListener | null = null;
  let watched: string[] = [];
  let today = '2026-10-05';
  let current = plans;
  const deps: PlanAlertDeps = {
    loadPlans: async () => new Map(Object.entries(current).map(([s, bands]) => [s, { bands }])),
    watchPrices: (symbols, onPrice) => {
      watched = symbols;
      listener = onPrice;
      return () => {
        listener = null;
      };
    },
    emit: (notice) => notices.push(notice),
    today: () => today,
    now: () => Date.parse('2026-10-05T14:00:00Z'),
    english: () => true,
    ...overrides,
  };
  return {
    alerts: createPlanAlerts(deps),
    notices,
    price: (symbol: string, value: number, session = '日盘') => listener?.(symbol, value, session),
    watched: () => watched,
    setToday: (day: string) => {
      today = day;
    },
    setPlans: (next: Record<string, PlanBand[]>) => {
      current = next;
    },
  };
}

const INTC: PlanBand[] = [
  { label: 'Add', price: 129.17, note: 'Thesis intact; add a third' },
  { label: 'Trim 1', price: 150.32 },
  { label: 'Thesis stop', price: 120.26 },
];

describe('plan level alerts', () => {
  it('watches every symbol that has a plan', async () => {
    const h = harness({ 'INTC.US': INTC, 'NVDA.US': [{ label: 'Add', price: 200 }] });
    await h.alerts.start();
    expect(h.watched().sort()).toEqual(['INTC.US', 'NVDA.US']);
  });

  it('does not alert on the first price, only on a later crossing', async () => {
    const h = harness({ 'INTC.US': INTC });
    await h.alerts.start();
    h.price('INTC.US', 128);
    expect(h.notices).toEqual([]);
    h.price('INTC.US', 130);
    h.price('INTC.US', 129);
    expect(h.notices).toHaveLength(1);
    expect(h.notices[0]).toMatchObject({ symbol: 'INTC.US', kind: 'plan_level' });
    expect(h.notices[0].title).toBe('INTC reached Add $129.17');
    expect(h.notices[0].body).toContain('Price $129.00');
    expect(h.notices[0].body).toContain('Thesis intact; add a third');
  });

  it('alerts once per level per day', async () => {
    const h = harness({ 'INTC.US': INTC });
    await h.alerts.start();
    h.price('INTC.US', 130);
    h.price('INTC.US', 129);
    h.price('INTC.US', 130);
    h.price('INTC.US', 129);
    expect(h.notices).toHaveLength(1);
    h.setToday('2026-10-06');
    h.price('INTC.US', 130);
    h.price('INTC.US', 129);
    expect(h.notices).toHaveLength(2);
  });

  it('words trims, stops and extended-hours prices', async () => {
    const h = harness({ 'INTC.US': INTC });
    await h.alerts.start();
    h.price('INTC.US', 149);
    h.price('INTC.US', 151, '盘前');
    h.price('INTC.US', 121);
    h.price('INTC.US', 120);
    const titles = h.notices.map((n) => n.title);
    expect(titles).toEqual([
      'INTC reached Trim 1 $150.32',
      'INTC reached Add $129.17',
      'INTC fell below Thesis stop $120.26',
    ]);
    expect(h.notices[0].body).toContain('pre-market');
    expect(h.notices[2].body).toContain('Recheck the plan');
  });

  it('picks up new plans on reload and stops watching dropped ones', async () => {
    const h = harness({ 'INTC.US': INTC });
    await h.alerts.start();
    h.setPlans({ 'AMD.US': [{ label: 'Add', price: 150 }] });
    await h.alerts.reload();
    expect(h.watched()).toEqual(['AMD.US']);
    h.price('INTC.US', 130);
    h.price('INTC.US', 129);
    expect(h.notices).toEqual([]);
  });

  it('keeps the last plans when a reload fails', async () => {
    const loadPlans = vi
      .fn<PlanAlertDeps['loadPlans']>()
      .mockResolvedValueOnce(new Map([['INTC.US', { bands: INTC }]]))
      .mockRejectedValueOnce(new Error('OpenD down'));
    const h = harness({}, { loadPlans });
    await h.alerts.start();
    await h.alerts.reload();
    h.price('INTC.US', 130);
    h.price('INTC.US', 129);
    expect(h.notices).toHaveLength(1);
  });

  it('writes Chinese when the interface is Chinese', async () => {
    const h = harness({ 'INTC.US': INTC }, { english: () => false });
    await h.alerts.start();
    h.price('INTC.US', 130);
    h.price('INTC.US', 129);
    expect(h.notices[0].title).toBe('INTC 到了 Add $129.17');
  });
});

describe('plan level alerts after review', () => {
  it('sends one notice for a gap through an add level and the stop, led by the stop', async () => {
    const h = harness({ 'INTC.US': INTC });
    await h.alerts.start();
    h.price('INTC.US', 131);
    h.price('INTC.US', 119);
    expect(h.notices).toHaveLength(1);
    expect(h.notices[0].title).toBe('INTC fell below Thesis stop $120.26');
    expect(h.notices[0].body).toContain('Also passed Add $129.17');
    expect(h.notices[0].body).toContain('Recheck the plan');
  });

  it('starts the new price feed before stopping the old one', async () => {
    const events: string[] = [];
    let plans: Record<string, PlanBand[]> = { 'INTC.US': INTC };
    const alerts = createPlanAlerts({
      loadPlans: async () => new Map(Object.entries(plans).map(([s, bands]) => [s, { bands }])),
      watchPrices: (symbols) => {
        events.push(`watch ${symbols.join(',')}`);
        return () => events.push(`stop ${symbols.join(',')}`);
      },
      emit: () => {},
      today: () => '2026-10-05',
      now: () => 0,
      english: () => true,
    });
    await alerts.start();
    plans = { 'INTC.US': INTC, 'AMD.US': [{ label: 'Add', price: 150 }] };
    await alerts.reload();
    expect(events).toEqual(['watch INTC.US', 'watch AMD.US,INTC.US', 'stop INTC.US']);
  });

  it('keeps the newer result when two reloads overlap', async () => {
    const resolvers: Array<(plans: Map<string, { bands: PlanBand[] }>) => void> = [];
    let watched: string[] = [];
    const alerts = createPlanAlerts({
      loadPlans: () => new Promise((resolve) => resolvers.push(resolve)),
      watchPrices: (symbols) => {
        watched = symbols;
        return () => {};
      },
      emit: () => {},
      today: () => '2026-10-05',
      now: () => 0,
      english: () => true,
    });
    const older = alerts.reload();
    const newer = alerts.reload();
    resolvers[1](new Map([['NEW.US', { bands: INTC }]]));
    await newer;
    resolvers[0](new Map([['OLD.US', { bands: INTC }]]));
    await older;
    expect(watched).toEqual(['NEW.US']);
  });

  it('reports failure when prices cannot be watched, and retries on the next reload', async () => {
    let fail = true;
    const alerts = createPlanAlerts({
      loadPlans: async () => new Map([['INTC.US', { bands: INTC }]]),
      watchPrices: () => {
        if (fail) throw new Error('stream not ready');
        return () => {};
      },
      emit: () => {},
      today: () => '2026-10-05',
      now: () => 0,
      english: () => true,
    });
    expect(await alerts.start()).toBe(false);
    fail = false;
    expect(await alerts.reload()).toBe(true);
  });

  it('prices Hong Kong holdings in HK dollars', async () => {
    const h = harness({ '5.HK': [{ label: 'Add', price: 132 }] });
    await h.alerts.start();
    h.price('5.HK', 133);
    h.price('5.HK', 131.5);
    expect(h.notices[0].title).toBe('5.HK reached Add HK$132.00');
  });
});
