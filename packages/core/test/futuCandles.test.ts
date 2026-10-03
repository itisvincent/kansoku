import { describe, expect, it } from 'vitest';
import {
  createFutuCandles,
  futuSecurity,
  toRawBars,
  type FutuKlBar,
} from '../src/marketdata/futu/futuCandles.js';
import type { OpenDSession } from '../src/marketdata/futu/openDClient.js';

const ts = (iso: string) => Date.parse(iso) / 1000;

function bar(timeIso: string, close = 100, extra: Partial<FutuKlBar> = {}): FutuKlBar {
  return {
    time: timeIso,
    timestamp: ts(timeIso),
    openPrice: close,
    highPrice: close + 1,
    lowPrice: close - 1,
    closePrice: close,
    volume: '1000',
    ...extra,
  };
}

describe('futuSecurity', () => {
  it('maps symbols to Futu markets and codes', () => {
    expect(futuSecurity('APP.US')).toEqual({ market: 11, code: 'APP' });
    expect(futuSecurity('5.HK')).toEqual({ market: 1, code: '00005' });
    expect(futuSecurity('600519.SH')).toEqual({ market: 21, code: '600519' });
    expect(futuSecurity('000001.SZ')).toEqual({ market: 22, code: '000001' });
    expect(() => futuSecurity('BTC.HAS')).toThrow();
  });
});

describe('toRawBars', () => {
  it('turns Futu end-stamped hour bars into start-stamped ones, half hour at the open included', () => {
    const bars = toRawBars(
      [
        bar('2026-10-02T13:00:00Z'), // ends 9:00 ET
        bar('2026-10-02T13:30:00Z'), // 9:00-9:30 half bar
        bar('2026-10-02T14:30:00Z'), // 9:30-10:30
      ],
      '1h',
    );
    expect(bars.map((b) => b.time)).toEqual([
      '2026-10-02T12:00:00.000Z',
      '2026-10-02T13:00:00.000Z',
      '2026-10-02T13:30:00.000Z',
    ]);
    expect(bars[0]).toMatchObject({ open: 100, high: 101, low: 99, close: 100, volume: '1000' });
  });

  it('handles the Hong Kong lunch break', () => {
    const bars = toRawBars(
      [bar('2026-10-02T03:30:00Z'), bar('2026-10-02T04:00:00Z'), bar('2026-10-02T06:00:00Z')],
      '1h',
    );
    expect(bars.map((b) => b.time)).toEqual([
      '2026-10-02T02:30:00.000Z',
      '2026-10-02T03:30:00.000Z',
      '2026-10-02T05:00:00.000Z',
    ]);
  });

  it('keeps daily bars on their own timestamp and drops blank bars', () => {
    const bars = toRawBars(
      [bar('2026-10-01T04:00:00Z'), bar('2026-10-02T04:00:00Z', 100, { isBlank: true })],
      'day',
    );
    expect(bars.map((b) => b.time)).toEqual(['2026-10-01T04:00:00.000Z']);
  });
});

function fakeSession(pages: FutuKlBar[][]) {
  const requests: Array<Record<string, unknown>> = [];
  let closed = 0;
  const session: OpenDSession = {
    async request<T>(_proto: number, c2s: Record<string, unknown>) {
      requests.push(c2s);
      const index = requests.length - 1;
      return {
        klList: pages[index] ?? [],
        ...(index < pages.length - 1 ? { nextReqKey: `key-${index + 1}` } : {}),
      } as T;
    },
    close() {
      closed += 1;
    },
  };
  return { session, requests, closed: () => closed };
}

describe('createFutuCandles', () => {
  const now = Date.parse('2026-10-03T14:00:00Z');

  it('pages through the range and returns the newest `count` bars', async () => {
    const page1 = [bar('2026-10-01T14:00:00Z', 1), bar('2026-10-01T15:00:00Z', 2)];
    const page2 = [bar('2026-10-02T14:00:00Z', 3), bar('2026-10-02T15:00:00Z', 4)];
    const fake = fakeSession([page1, page2]);
    const candles = createFutuCandles({
      session: async () => fake.session,
      now: () => now,
      sleep: async () => {},
    });
    const bars = await candles.getKline('APP.US', '60m', 3, 'all');
    expect(bars.map((b) => b.close)).toEqual([2, 3, 4]);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]).toMatchObject({
      klType: 9,
      security: { market: 11, code: 'APP' },
      extendedTime: true,
      maxAckKLNum: 1000,
    });
    expect(fake.requests[1]).toMatchObject({ nextReqKey: 'key-1' });
    expect(fake.closed()).toBe(1);
  });

  it('asks only for regular hours outside the all-sessions view', async () => {
    const fake = fakeSession([[bar('2026-10-02T14:30:00Z')]]);
    const candles = createFutuCandles({ session: async () => fake.session, now: () => now, sleep: async () => {} });
    await candles.getKline('APP.US', '5m', 10);
    expect(fake.requests[0]).toMatchObject({ klType: 6, extendedTime: false });
  });

  it('requests a history range by date', async () => {
    const fake = fakeSession([[bar('2026-08-03T09:00:00Z')]]);
    const candles = createFutuCandles({ session: async () => fake.session, now: () => now, sleep: async () => {} });
    await candles.getKlineHistory('APP.US', '1h', '2026-08-01', '2026-09-01', 'all');
    expect(fake.requests[0]).toMatchObject({
      beginTime: '2026-08-01 00:00:00',
      endTime: '2026-09-01 23:59:59',
    });
  });

  it('refuses periods Futu is not wired for, without opening a session', async () => {
    let opened = false;
    const candles = createFutuCandles({
      session: async () => {
        opened = true;
        return fakeSession([]).session;
      },
      now: () => now,
      sleep: async () => {},
    });
    await expect(candles.getKline('APP.US', 'week', 10)).rejects.toThrow(/week/);
    expect(opened).toBe(false);
  });

  it('waits when it would go past Futu’s request limit', async () => {
    const waits: number[] = [];
    let clock = now;
    const pages = Array.from({ length: 60 }, () => [bar('2026-10-02T14:30:00Z')]);
    const fake = fakeSession(pages);
    const candles = createFutuCandles({
      session: async () => fake.session,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    for (let i = 0; i < 56; i++) await candles.getKlineHistory('APP.US', '1h', '2026-10-01', '2026-10-02');
    expect(waits.length).toBeGreaterThan(0);
  });
});
