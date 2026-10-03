import { createHash } from 'node:crypto';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodePackets, encodePacket, PROTO } from '../src/marketdata/futu/openDClient.js';
import {
  futuStatus,
  futuSymbol,
  readFutuAccount,
  readFutuWatchlist,
  resetFutuCacheForTests,
} from '../src/marketdata/futu/futuAccount.js';
import { inWatchedMarkets, mergePositions, withFutu } from '../src/marketdata/futu/withFutu.js';
import type { MarketDataProvider, RawPosition } from '../src/marketdata/types.js';

/** A fake OpenD that answers like the real one (JSON bodies, OpenAPI headers). */
function fakeOpenD(answer: (protoId: number, c2s: Record<string, unknown>) => unknown) {
  const seen: Array<{ protoId: number; c2s: Record<string, unknown> }> = [];
  const server = createServer((socket) => {
    let buffer: Buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { packets, rest } = decodePackets(buffer);
      buffer = rest;
      for (const packet of packets) {
        const body = JSON.parse(packet.body.toString('utf8')) as { c2s: Record<string, unknown> };
        seen.push({ protoId: packet.protoId, c2s: body.c2s });
        const s2c = answer(packet.protoId, body.c2s);
        const reply =
          s2c instanceof Error
            ? { retType: -1, retMsg: s2c.message }
            : { retType: 0, retMsg: '', errCode: 0, s2c };
        socket.write(encodePacket(packet.protoId, packet.serialNo, reply));
      }
    });
  });
  return { server, seen };
}

const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
  );

describe('OpenD packets', () => {
  it('writes the OpenAPI header: FT, proto id, JSON format, serial, length, SHA1 of the body', () => {
    const packet = encodePacket(2102, 7, { c2s: { a: 1 } });
    const body = Buffer.from(JSON.stringify({ c2s: { a: 1 } }));
    expect(packet.toString('ascii', 0, 2)).toBe('FT');
    expect(packet.readUInt32LE(2)).toBe(2102);
    expect(packet.readUInt8(6)).toBe(1);
    expect(packet.readUInt32LE(8)).toBe(7);
    expect(packet.readUInt32LE(12)).toBe(body.length);
    expect(packet.subarray(16, 36)).toEqual(createHash('sha1').update(body).digest());
    expect(packet.length).toBe(44 + body.length);
  });

  it('splits back-to-back and partial packets', () => {
    const a = encodePacket(1, 1, { x: 1 });
    const b = encodePacket(2, 2, { y: 2 });
    const joined = Buffer.concat([a, b.subarray(0, 10)]);
    const { packets, rest } = decodePackets(joined);
    expect(packets.map((p) => p.protoId)).toEqual([1]);
    expect(rest.length).toBe(10);
  });
});

describe('Futu symbols', () => {
  it('maps Futu codes to Kansoku symbols', () => {
    expect(futuSymbol('00700', 'HK')).toBe('700.HK');
    expect(futuSymbol('AAPL', 'US')).toBe('AAPL.US');
    expect(futuSymbol('BRK.B', 'US')).toBe('BRK.B.US');
    expect(futuSymbol('600519', 'SH')).toBe('600519.SH');
    expect(futuSymbol('000001', 'SZ')).toBe('000001.SZ');
    expect(futuSymbol('', 'US')).toBeNull();
  });
});

describe('reading a Futu account through OpenD', () => {
  let server: Server;
  let port: number;
  let seen: ReturnType<typeof fakeOpenD>['seen'];

  beforeEach(async () => {
    resetFutuCacheForTests();
    const fake = fakeOpenD((protoId, c2s) => {
      if (protoId === PROTO.initConnect) return { serverVer: 900, connID: '1', keepAliveInterval: 10 };
      if (protoId === PROTO.getAccList) {
        return {
          accList: [
            { trdEnv: 1, accID: '281756479859383816', trdMarketAuthList: [1, 2] },
            { trdEnv: 0, accID: '999', trdMarketAuthList: [2] }, // paper account: ignored
            { trdEnv: 1, accID: '777', trdMarketAuthList: [2], accStatus: 1 }, // closed: ignored
          ],
        };
      }
      if (protoId === PROTO.getPositionList) {
        const market = (c2s.header as { trdMarket: number }).trdMarket;
        if (market === 1) {
          return {
            positionList: [
              { positionID: '11', code: '00700', name: '腾讯控股', qty: 200, canSellQty: 200, averageCostPrice: 480.5, price: 500, val: 100000, secMarket: 1, positionSide: 0 },
            ],
          };
        }
        return {
          positionList: [
            { positionID: '21', code: 'NVDA', name: 'NVIDIA', qty: 10, canSellQty: 10, costPrice: 120, price: 130, val: 1300, secMarket: 2, positionSide: 0 },
            { positionID: '22', code: 'TSLA', name: 'Tesla', qty: 5, canSellQty: 0, costPrice: 300, price: 280, val: 1400, secMarket: 2, positionSide: 1 },
          ],
        };
      }
      if (protoId === PROTO.getFunds) {
        return { funds: { totalAssets: 18471.24, cash: -16697.98, marketVal: 28327.56, currency: 2 } };
      }
      if (protoId === PROTO.getUserSecurityGroup) {
        return { groupList: [{ groupName: '全部', groupType: 2 }, { groupName: 'AI', groupType: 1 }] };
      }
      if (protoId === PROTO.getUserSecurity) {
        return {
          staticInfoList: [
            { basic: { security: { market: 11, code: 'MU' } } },
            { basic: { security: { market: 1, code: '09988' } } },
          ],
        };
      }
      return {};
    });
    server = fake.server;
    seen = fake.seen;
    port = await listen(server);
  });

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const settings = () => ({ enabled: true, watchlist: true, candles: 'longbridge' as const, host: '127.0.0.1', port });

  it('reads real-account positions in Kansoku form, shorts negative, paper accounts skipped', async () => {
    const account = await readFutuAccount(settings());
    expect(account.accounts).toBe(1);
    expect(account.positions).toEqual([
      { symbol: '700.HK', name: '腾讯控股', quantity: '200', available: '200', cost_price: '480.5', currency: 'HKD', market: 'HK' },
      { symbol: 'NVDA.US', name: 'NVIDIA', quantity: '10', available: '10', cost_price: '120', currency: 'USD', market: 'US' },
      { symbol: 'TSLA.US', name: 'Tesla', quantity: '-5', available: '0', cost_price: '300', currency: 'USD', market: 'US' },
    ]);
    expect(seen[0].protoId).toBe(PROTO.initConnect);
    expect(account.overview).toMatchObject({ total_asset: '18471.24', total_cash: '-16697.98', currency: 'USD' });
    // Only queries are sent: account list, positions and funds, never an order.
    expect(new Set(seen.map((s) => s.protoId))).toEqual(
      new Set([PROTO.initConnect, PROTO.getAccList, PROTO.getPositionList, PROTO.getFunds]),
    );
    // The closed account is never asked for positions.
    expect(seen.some((s) => (s.c2s.header as { accID?: string } | undefined)?.accID === '777')).toBe(false);
  });

  it('reads the watchlist from the system All group', async () => {
    expect(await readFutuWatchlist(settings())).toEqual(['MU.US', '9988.HK']);
    expect(seen.filter((s) => s.protoId === PROTO.getUserSecurity).map((s) => s.c2s.groupName)).toEqual(['全部']);
  });

  it('reports a connected status with counts', async () => {
    expect(await futuStatus(settings())).toMatchObject({ state: 'connected', accounts: 1, positions: 3 });
  });

  it('reports OpenD as unreachable when nothing listens', async () => {
    const status = await futuStatus({ enabled: true, watchlist: false, candles: 'longbridge' as const, host: '127.0.0.1', port: 1 });
    expect(status.state).toBe('unreachable');
    expect(status.message).toMatch(/OpenD/);
  });
});

describe('withFutu', () => {
  const lb: RawPosition = { symbol: 'NVDA.US', name: 'NVIDIA', quantity: '20', available: '20', cost_price: '100', currency: 'USD', market: 'US' };
  const futu: RawPosition = { ...lb, quantity: '10', available: '10', cost_price: '130' };

  it('combines a stock held at both brokers into one position', () => {
    const [merged] = mergePositions([[lb], [futu]]);
    expect(merged.quantity).toBe('30');
    expect(Number(merged.cost_price)).toBeCloseTo(110);
  });

  it('adds Futu positions and watchlist only when enabled, and survives OpenD being down', async () => {
    const base = {
      getPositions: async () => [lb],
      getWatchlistSymbols: async () => ['NVDA.US'],
    } as unknown as MarketDataProvider;
    let enabled = false;
    let down = false;
    const warnings: string[] = [];
    const provider = withFutu(base, {
      settings: () => ({ enabled, watchlist: true, candles: 'longbridge' as const, host: '127.0.0.1', port: 11111 }),
      watchedMarkets: () => ['US', 'HK'],
      account: async () => {
        if (down) throw new Error('OpenD is not reachable');
        return {
          accounts: 1,
          positions: [{ ...futu, symbol: '700.HK', market: 'HK' }],
          holdings: [],
          overview: null,
        };
      },
      watchlist: async () => ['9988.HK'],
      warn: (m) => warnings.push(m),
    });

    expect((await provider.getPositions!()).map((p) => p.symbol)).toEqual(['NVDA.US']);
    enabled = true;
    expect((await provider.getPositions!()).map((p) => p.symbol)).toEqual(['NVDA.US', '700.HK']);
    expect(await provider.getWatchlistSymbols!()).toEqual(['NVDA.US', '9988.HK']);
    down = true;
    expect((await provider.getPositions!()).map((p) => p.symbol)).toEqual(['NVDA.US']);
    expect(warnings[0]).toMatch(/positions unavailable/);
  });

  it('still returns Futu positions and totals when the base broker refuses', async () => {
    const scopeError = new Error('API error (code 403308): Target API scope is not in authorized scopes');
    const base = {
      getPositions: async () => {
        throw scopeError;
      },
      getPortfolio: async () => {
        throw scopeError;
      },
      getWatchlistSymbols: async () => ['NVDA.US'],
    } as unknown as MarketDataProvider;
    const overview = { total_asset: '100', market_cap: '80', total_cash: '20', total_pl: '0', total_today_pl: '0', currency: 'USD' };
    const provider = withFutu(base, {
      settings: () => ({ enabled: true, watchlist: false, candles: 'longbridge' as const, host: '127.0.0.1', port: 11111 }),
      account: async () => ({ accounts: 1, positions: [futu], holdings: [], overview }),
      watchlist: async () => ['9988.HK'],
      warn: () => {},
    });
    expect(await provider.getPositions!()).toEqual([futu]);
    expect((await provider.getPortfolio!()).overview).toEqual(overview);
    // The Futu watchlist stays out until its own switch is on.
    expect(await provider.getWatchlistSymbols!()).toEqual(['NVDA.US']);
  });

  it('throws the base error when Futu is off', async () => {
    const base = { getPositions: async () => { throw new Error('denied'); } } as unknown as MarketDataProvider;
    const provider = withFutu(base, {
      settings: () => ({ enabled: false, watchlist: false, candles: 'longbridge' as const, host: '127.0.0.1', port: 11111 }),
      account: async () => { throw new Error('unused'); },
      watchlist: async () => [],
      warn: () => {},
    });
    await expect(provider.getPositions!()).rejects.toThrow('denied');
  });
});

describe('inWatchedMarkets', () => {
  it('keeps only the Futu watchlist symbols in the watched markets', () => {
    const symbols = ['MU.US', '700.HK', '600519.SH', 'BTC.HAS'];
    expect(inWatchedMarkets(symbols, ['US'])).toEqual(['MU.US']);
    expect(inWatchedMarkets(symbols, ['US', 'HK', 'CN'])).toEqual(['MU.US', '700.HK', '600519.SH']);
  });
});
