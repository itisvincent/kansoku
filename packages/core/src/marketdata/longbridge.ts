import type { MacroEventItem, NewsItem, RawBar } from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';
import { LongbridgeCliError, runLongbridgeJson } from './longbridgeCli.js';
import { getSharedQuoteSocket } from './sharedSocket.js';
import { onAccountCacheReset } from './accountRefresh.js';
import { getInterfaceLocale } from '../settings/interfaceLocale.js';
import { LongbridgeProtocolError, LongbridgeResponseError } from './longbridgeSocket.js';
import type { FlowRow } from '../analysis/simple.js';
import type { Market } from '../symbols/symbol.utils.js';
import type {
  EarningsCalendarEntry,
  IndustryRankResult,
  MacroCalendarResult,
  MarketDataProvider,
  MarketTempResult,
  RawCapitalDistribution,
  RawPortfolio,
  RawPosition,
  RawQuote,
} from './types.js';
import { createRateGate } from './rateGate.js';

export type LongbridgeRunner = <T>(args: string[]) => Promise<T>;

interface CliBar {
  time: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: number;
}

interface CliNewsItem {
  id: string | number;
  title: string;
  published_at: string;
  url: string;
}

interface CliSecurityInfo {
  symbol?: string;
  name?: string;
}

interface CliWatchlistGroup {
  securities?: Array<{ symbol?: string } | string>;
}

interface CliCalendarInfo {
  counter_id?: string;
  content?: string;
  datetime?: string;
  star?: number;
  data_kv?: Array<{ type?: string; value?: string }>;
}

interface CliCalendarPayload {
  list?: Array<{ date?: string; infos?: CliCalendarInfo[] }>;
}

const MACRO_SUPPORTED_MARKETS = new Set<Market>(['US']);

function calendarKv(info: CliCalendarInfo, type: string): string | null {
  const value = info.data_kv?.find((item) => item.type === type)?.value;
  return value && value !== '--' ? value : null;
}

const SUPPORTED_PERIODS = new Set(['1m', '5m', '15m', '30m', '1h', 'day', 'week', 'month', 'year']);
const PERIOD_ALIASES: Record<string, string> = { '60m': '1h' };

function normalizePeriod(period: string): string {
  const normalized = PERIOD_ALIASES[period] ?? period;
  if (!SUPPORTED_PERIODS.has(normalized)) {
    throw new ClientError(
      `getKline: unsupported period "${period}"`,
      `supported periods: ${[...SUPPORTED_PERIODS].join(', ')} (aliases: ${Object.keys(PERIOD_ALIASES).join(', ')})`,
    );
  }
  return normalized;
}

function number(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

async function newsStrict(
  run: LongbridgeRunner,
  symbol: string,
  limit: number,
): Promise<NewsItem[]> {
  const rows = await callCli<CliNewsItem[]>('news', run, ['news', symbol, '--lang', 'zh-CN']);
  return rows.slice(0, limit).map((row) => ({
    id: String(row.id),
    title: row.title,
    published_at: row.published_at,
    url: row.url,
  }));
}

// Longbridge allows one finance-calendar request per second. Every calendar read goes
// through this gate: one at a time, spaced out, retried when refused. Without it the home
// calendar's parallel reads were mostly refused and those stocks showed no earnings date.
const calendarGate = createRateGate({ minIntervalMs: 1100 });

async function callCli<T>(label: string, run: LongbridgeRunner, args: string[]): Promise<T> {
  try {
    return await run<T>(args);
  } catch (error) {
    if (error instanceof ClientError) throw error;
    const detail =
      error instanceof LongbridgeCliError && error.detail
        ? `${error.message}（${error.detail}）`
        : error instanceof Error
          ? error.message
          : String(error);
    throw new ClientError(
      `longbridge ${label} failed: ${detail}`,
      '请确认已安装 longbridge CLI，并执行 longbridge auth login 完成登录。',
      502,
    );
  }
}

export interface QuoteQueryTransport {
  queryQuotes(symbols: string[]): Promise<RawQuote[]>;
  queryCandlesticks(
    symbol: string,
    period: string,
    count: number,
    session: 'intraday' | 'all',
  ): Promise<RawBar[]>;
  queryCapitalFlow(symbol: string): Promise<FlowRow[]>;
  queryCapitalDistribution(symbol: string): Promise<RawCapitalDistribution>;
  queryStaticNames(symbols: string[]): Promise<Array<{ symbol: string; name: string }>>;
}

// 长桥行情连接每账户限 10 条；一次性 CLI 进程退出后会留下 ~25 分钟的幽灵会话。
// 配额打满时若继续回退 CLI，CLI 抢到刚释放的槽又会立刻幽灵化，故障自我延续——
// 所以识别到配额错误后进入冷却期，冷却期内只走 WS（优雅关闭不烧槽），不再spawn CLI。
const QUOTA_COOLDOWN_MS = 5 * 60_000;
const CLI_FALLBACK_COOLDOWN_MS = 60_000;

function isQuotaError(message: string): boolean {
  return (
    message.includes('command=2 status=5') || message.includes('connections limitation is hit')
  );
}

// A login without the trading-data scope refuses every account call the same way until
// the user logs in again, so the refusal is remembered instead of spawning the CLI again.
const ACCOUNT_DENIED_MS = 10 * 60_000;

export function isScopeDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /403308|not in authorized scopes/i.test(message);
}

function scopeDeniedError(label: string, cause: unknown): ClientError {
  const en = getInterfaceLocale() !== 'zh-CN';
  const error = new ClientError(
    en
      ? `Longbridge cannot read your ${label}: its login lacks the account-data permission (code 403308).`
      : `长桥读不到${label === 'positions' ? '持仓' : '账户'}：当前登录没有账户数据权限（代码 403308）。`,
    en
      ? 'Run "longbridge auth login" and allow account access, or turn on Futu in Settings > Connections.'
      : '重新执行 longbridge auth login 并允许账户权限，或在 设置 > 连接 中开启富途账户。',
    403,
  );
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

// The socket drops now and then (a burst of timed-out requests, then "closed") and is
// back within seconds. One retry after a pause lets queued requests ride the reconnect
// instead of all landing on the CLI fallback, which allows one run a minute.
const WS_RETRY_DELAY_MS = 1_500;

export function isWsConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WebSocket (?:closed|is not connected|did not open|connection failed)|request timed out/i.test(
    message,
  );
}

export function createLongbridgeProvider(
  run: LongbridgeRunner = runLongbridgeJson,
  socket?: () => QuoteQueryTransport,
  options: { wsRetryDelayMs?: number } = {},
): MarketDataProvider {
  const wsRetryDelayMs = options.wsRetryDelayMs ?? WS_RETRY_DELAY_MS;
  const securityNameCache = new Map<string, Promise<string | null>>();
  let quotaCooldownUntil = 0;
  let cliFallbackCooldownUntil = 0;
  let cliFallbackInFlight = false;
  // The account-wide history limit (301607) blocks every symbol; any other failure only
  // cools down the symbol that failed.
  let historyCooldownUntil = 0;
  let historyFailure: unknown;
  const symbolHistoryCooldown = new Map<string, { until: number; failure: unknown }>();
  let accountDenied: { until: number; label: string; cause: unknown } | null = null;
  onAccountCacheReset(() => {
    accountDenied = null;
  });

  async function accountCall<T>(label: string, args: string[]): Promise<T> {
    if (accountDenied && Date.now() < accountDenied.until) {
      throw scopeDeniedError(label, accountDenied.cause);
    }
    try {
      return await callCli<T>(label, run, args);
    } catch (error) {
      if (!isScopeDenied(error)) throw error;
      accountDenied = { until: Date.now() + ACCOUNT_DENIED_MS, label, cause: error };
      throw scopeDeniedError(label, error);
    }
  }
  let historyQueue: Promise<unknown> = Promise.resolve();

  function quotaError(label: string): ClientError {
    return new ClientError(
      `longbridge ${label} failed: 长桥行情连接数已满（limit 10）`,
      '等待约 25 分钟让幽灵会话过期后自动恢复；期间避免运行 quote/kline/capital/static 类 longbridge CLI 命令，也不要重启 app。',
      503,
    );
  }

  async function wsFirst<T>(
    label: string,
    viaSocket: () => Promise<T>,
    viaCli: () => Promise<T>,
  ): Promise<T> {
    if (!socket) return viaCli();
    const viaSocketWithRetry = async () => {
      try {
        return await viaSocket();
      } catch (error) {
        if (!isWsConnectionError(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, wsRetryDelayMs));
        return await viaSocket();
      }
    };
    try {
      return await viaSocketWithRetry();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isQuotaError(message)) {
        quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.warn(
          `[longbridge] ws ${label} rejected: quote connection quota exhausted, skipping CLI fallback`,
        );
        throw quotaError(label);
      }
      if (error instanceof LongbridgeResponseError && error.rateLimited) {
        console.warn(
          `[longbridge] ws ${label} rate limited (${error.code}), skipping CLI fallback`,
        );
        throw error;
      }
      if (error instanceof LongbridgeResponseError || error instanceof LongbridgeProtocolError) {
        console.warn(`[longbridge] ws ${label} rejected, skipping CLI fallback:`, message);
        throw error;
      }
      if (Date.now() < quotaCooldownUntil) {
        console.warn(
          `[longbridge] ws ${label} failed during quota cooldown, skipping CLI fallback:`,
          message,
        );
        throw quotaError(label);
      }
      console.warn(`[longbridge] ws ${label} failed, falling back to CLI:`, message);
      if (cliFallbackInFlight || Date.now() < cliFallbackCooldownUntil) {
        throw new ClientError(
          `longbridge ${label} failed: WS 暂时不可用，CLI 兜底正在冷却`,
          '为避免创建大量额外行情连接，CLI 兜底每分钟最多执行一次。',
          503,
        );
      }
      cliFallbackInFlight = true;
      cliFallbackCooldownUntil = Date.now() + CLI_FALLBACK_COOLDOWN_MS;
      try {
        return await viaCli();
      } catch (cliError) {
        const cliMessage = cliError instanceof Error ? cliError.message : String(cliError);
        if (isQuotaError(cliMessage)) quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
        throw cliError;
      } finally {
        cliFallbackInFlight = false;
      }
    }
  }

  return {
    name: 'longbridge',
    capabilities: new Set([
      'flow',
      'capital-distribution',
      'positions',
      'watchlist',
      'portfolio',
      'earnings-calendar',
      'macro-calendar',
      'market-temp',
      'industry-rank',
      'market-cap',
    ]),

    async getKline(
      symbol: string,
      period: string,
      count: number,
      session?: string,
    ): Promise<RawBar[]> {
      const normalized = normalizePeriod(period);
      return wsFirst(
        'kline',
        () =>
          socket!().queryCandlesticks(
            symbol,
            normalized,
            count,
            session === 'all' ? 'all' : 'intraday',
          ),
        async () => {
          const args = ['kline', symbol, '--period', normalized, '--count', String(count)];
          if (session === 'all') args.push('--session', 'all');
          const rows = await callCli<CliBar[]>('kline', run, args);
          return rows.map((row) => ({
            time: row.time,
            open: number(row.open),
            high: number(row.high),
            low: number(row.low),
            close: number(row.close),
            volume: row.volume,
          }));
        },
      );
    },

    getKlineHistory(symbol, period, start, end, session) {
      const request = historyQueue
        .catch(() => {})
        .then(async () => {
          if (Date.now() < historyCooldownUntil) throw historyFailure;
          if (Date.now() < quotaCooldownUntil) throw quotaError('history');
          const symbolCooldown = symbolHistoryCooldown.get(symbol);
          if (symbolCooldown && Date.now() < symbolCooldown.until) throw symbolCooldown.failure;
          const args = [
            'kline',
            'history',
            symbol,
            '--period',
            normalizePeriod(period),
            '--start',
            start,
            '--end',
            end,
          ];
          if (session === 'all') args.push('--session', 'all');
          try {
            const rows = await callCli<CliBar[]>('history', run, args);
            return rows.map((row) => ({
              time: row.time,
              open: number(row.open),
              high: number(row.high),
              low: number(row.low),
              close: number(row.close),
              volume: row.volume,
            }));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/301607|history candlestick symbol count out of limit/.test(message)) {
              historyFailure = error;
              historyCooldownUntil = Date.now() + 30 * 60_000;
            } else {
              symbolHistoryCooldown.set(symbol, { until: Date.now() + 60_000, failure: error });
            }
            if (isQuotaError(message)) quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
            throw error;
          }
        });
      historyQueue = request;
      return request;
    },

    getQuotes(symbols: string[]): Promise<RawQuote[]> {
      if (!symbols.length) return Promise.resolve([]);
      return wsFirst(
        'quote',
        () => socket!().queryQuotes(symbols),
        () => callCli<RawQuote[]>('quote', run, ['quote', ...symbols]),
      );
    },

    getSecurityName(symbol: string): Promise<string | null> {
      const key = symbol.toUpperCase();
      const cached = securityNameCache.get(key);
      if (cached) return cached;

      const request = wsFirst<CliSecurityInfo[]>(
        'static',
        () => socket!().queryStaticNames([symbol]),
        () => run<CliSecurityInfo[]>(['static', symbol, '--lang', 'zh-CN']),
      )
        .then((rows) => {
          const exact = rows.find((row) => row.symbol?.toUpperCase() === key) ?? rows[0];
          const name = exact?.name?.trim();
          return name || null;
        })
        .catch(() => null);
      securityNameCache.set(key, request);
      void request.then((name) => {
        if (!name && securityNameCache.get(key) === request) securityNameCache.delete(key);
      });
      return request;
    },

    getNewsStrict(symbol: string, limit = 6): Promise<NewsItem[]> {
      return newsStrict(run, symbol, limit);
    },

    async getNews(symbol: string, limit = 6): Promise<NewsItem[]> {
      try {
        return await newsStrict(run, symbol, limit);
      } catch {
        // Unchanged on purpose: the chart sidebar and the news panel treat news as
        // decoration, and an error card there would be worse than a quiet gap.
        return [];
      }
    },

    getFlow(symbol: string): Promise<FlowRow[]> {
      return wsFirst(
        'capital flow',
        () => socket!().queryCapitalFlow(symbol),
        () => callCli<FlowRow[]>('capital flow', run, ['capital', symbol, '--flow']),
      );
    },

    getCapitalDistribution(symbol: string): Promise<RawCapitalDistribution> {
      return wsFirst(
        'capital distribution',
        () => socket!().queryCapitalDistribution(symbol),
        () => callCli<RawCapitalDistribution>('capital distribution', run, ['capital', symbol]),
      );
    },

    getPositions(): Promise<RawPosition[]> {
      return accountCall<RawPosition[]>('positions', ['positions']);
    },

    async getPortfolio(): Promise<RawPortfolio> {
      const result = await accountCall<RawPortfolio>('portfolio', ['portfolio']);
      return {
        overview: result.overview,
        holdings: result.holdings.map((holding) => ({
          symbol: holding.symbol,
          name: holding.name,
          currency: holding.currency,
          quantity: holding.quantity,
          cost_price: holding.cost_price,
          market_price: holding.market_price,
          market_value: holding.market_value,
          prev_close: holding.prev_close,
        })),
      };
    },

    async getWatchlistSymbols(): Promise<string[]> {
      const groups = await callCli<CliWatchlistGroup[]>('watchlist', run, ['watchlist']);
      const symbols = new Set<string>();
      for (const group of groups) {
        for (const item of group.securities ?? []) {
          const symbol = typeof item === 'string' ? item : item.symbol;
          if (symbol) symbols.add(symbol);
        }
      }
      return [...symbols];
    },

    async getEarningsCalendar(
      symbol: string,
      fromDate: string,
    ): Promise<EarningsCalendarEntry | null> {
      const payload = await calendarGate.run(() =>
        callCli<CliCalendarPayload>('finance calendar report', run, [
          'finance-calendar',
          'report',
          '--symbol',
          symbol,
        ]),
      );
      for (const day of payload.list ?? []) {
        if (!day.date || day.date < fromDate) continue;
        const info =
          day.infos?.find((item) => !item.counter_id || item.counter_id === symbol) ??
          day.infos?.[0];
        if (info?.content) return { date: day.date, title: info.content };
      }
      return null;
    },

    async getMacroCalendar(
      market: Market,
      startDate: string,
      endDate: string,
      minStar: number,
    ): Promise<MacroCalendarResult> {
      if (!MACRO_SUPPORTED_MARKETS.has(market)) return { supported: false };
      const payload = await calendarGate.run(() =>
        callCli<CliCalendarPayload>('finance calendar macrodata', run, [
          'finance-calendar',
          'macrodata',
          '--market',
          market,
          '--star',
          String(minStar),
          '--start',
          startDate,
          '--end',
          endDate,
        ]),
      );
      const items: MacroEventItem[] = [];
      for (const day of payload.list ?? []) {
        for (const info of day.infos ?? []) {
          const epoch = Number(info.datetime);
          if (!info.content || !Number.isFinite(epoch) || (info.star ?? 0) < minStar) continue;
          items.push({
            // The provider's own key for this slot, kept verbatim: the title it
            // renders gains the estimate and then the actual, so nothing downstream
            // can use it as an identity.
            sourceId: info.counter_id?.trim() || null,
            ts: new Date(epoch * 1000).toISOString(),
            title: info.content,
            estimate: calendarKv(info, 'estimate'),
            previous: calendarKv(info, 'previous'),
            actual: calendarKv(info, 'actual'),
          });
        }
      }
      return { supported: true, items };
    },

    async getMarketTemp(market: Market): Promise<MarketTempResult | null> {
      const rows = await callCli<Array<{ field?: string; value?: string }>>('market-temp', run, [
        'market-temp',
        market,
      ]);
      const byField = new Map(rows.map((row) => [row.field, row.value]));
      const num = (field: string): number | null => {
        const value = Number(byField.get(field));
        return Number.isFinite(value) ? value : null;
      };
      const temperature = num('Temperature');
      if (temperature == null) return null;
      return {
        temperature,
        valuation: num('Valuation'),
        sentiment: num('Sentiment'),
        description: byField.get('Description')?.trim() || null,
      };
    },

    async getIndustryRank(market: Market): Promise<IndustryRankResult[]> {
      const payload = await callCli<{
        items?: Array<{
          lists?: Array<{
            name?: string;
            chg?: string;
            leading_ticker?: string;
            leading_chg?: string;
          }>;
        }>;
      }>('industry-rank', run, ['industry-rank', '--market', market]);
      const pctNum = (value: string | undefined): number | null => {
        const n = Number(value);
        return value != null && value !== '' && Number.isFinite(n) ? n * 100 : null;
      };
      const rows: IndustryRankResult[] = [];
      for (const item of payload.items ?? []) {
        for (const entry of item.lists ?? []) {
          if (!entry.name) continue;
          rows.push({
            name: entry.name,
            chg: pctNum(entry.chg),
            leading_ticker: entry.leading_ticker?.trim() || null,
            leading_chg: pctNum(entry.leading_chg),
          });
        }
      }
      return rows;
    },

    async getMarketCaps(symbols: string[]): Promise<Record<string, number>> {
      if (!symbols.length) return {};
      const rows = await callCli<Array<{ symbol?: string; mktcap?: string }>>('calc-index', run, [
        'calc-index',
        ...symbols,
        '--fields',
        'mktcap',
      ]);
      const caps: Record<string, number> = {};
      for (const row of rows) {
        const cap = Number(row.mktcap);
        if (row.symbol && Number.isFinite(cap) && cap > 0) caps[row.symbol] = cap;
      }
      return caps;
    },
  };
}

export const longbridgeProvider: MarketDataProvider = createLongbridgeProvider(
  runLongbridgeJson,
  getSharedQuoteSocket,
);
