import { getInterfaceLocale, type InterfaceLocale } from '../../../settings/interfaceLocale.js';

type Bilingual = Record<InterfaceLocale, string>;

const KLINE_PERIOD_LABELS: Record<string, Bilingual> = Object.assign(Object.create(null), {
  m5: { 'en-US': '5-minute', 'zh-CN': '5 分钟' },
  m15: { 'en-US': '15-minute', 'zh-CN': '15 分钟' },
  h1: { 'en-US': '1-hour', 'zh-CN': '1 小时' },
});

const FIXED_TOOL_ACTIVITIES: Record<string, Bilingual> = Object.assign(Object.create(null), {
  read_data_pack: { 'en-US': 'Reading the data pack', 'zh-CN': '正在读取数据包' },
  fetch_news: { 'en-US': 'Checking the latest news', 'zh-CN': '正在查最新新闻' },
  append_comment: { 'en-US': 'Recording an interim comment', 'zh-CN': '正在记录阶段点评' },
  write_journal: { 'en-US': 'Writing the observation journal', 'zh-CN': '正在写观察日志' },
  submit_prediction: { 'en-US': 'Submitting the prediction', 'zh-CN': '正在提交预测' },
  submit_section: { 'en-US': 'Submitting an interim read', 'zh-CN': '正在提交中间读数' },
});

const RESEARCH_TOOL_ARG_KEYS: Record<string, string> = Object.assign(Object.create(null), {
  bash: 'command',
  read_skill: 'name',
  web_search: 'query',
});

const ARG_SUMMARY_MAX_CHARS = 40;

export type AnalystStatusKey =
  | 'preparing'
  | 'loadingDiscipline'
  | 'gatheringPack'
  | 'planningRun'
  | 'checkingNews'
  | 'recordingJudgment'
  | 'externalResearch'
  | 'writingReview'
  | 'finalizing';

const STATUS_LABELS: Record<AnalystStatusKey, Bilingual> = Object.assign(Object.create(null), {
  preparing: {
    'en-US': 'Preparing the analysis environment',
    'zh-CN': '正在准备分析环境',
  },
  loadingDiscipline: {
    'en-US': 'Loading analysis discipline and tools',
    'zh-CN': '正在加载分析纪律与工具',
  },
  gatheringPack: {
    'en-US': 'Gathering multi-timeframe quotes, flows, and positions',
    'zh-CN': '正在整理多周期行情、资金流与持仓',
  },
  planningRun: {
    'en-US': 'Planning analysis steps and reading market data',
    'zh-CN': '正在规划分析步骤并读取市场信息',
  },
  checkingNews: {
    'en-US': 'Checking the latest news and catalysts',
    'zh-CN': '正在核对最新消息与催化事件',
  },
  recordingJudgment: {
    'en-US': 'Recording an interim judgment',
    'zh-CN': '正在记录阶段性判断',
  },
  externalResearch: {
    'en-US': 'Researching external sources and risk items',
    'zh-CN': '正在补充外部资料与风险信息',
  },
  writingReview: {
    'en-US': 'Writing the review journal',
    'zh-CN': '正在写入本次复盘日志',
  },
  finalizing: {
    'en-US': 'Generating the chart and submitting the final conclusion',
    'zh-CN': '正在生成图表并提交最终结论',
  },
});

function pick(label: Bilingual): string {
  return label[getInterfaceLocale()];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeResearchArgs(name: string, args: unknown): string | null {
  const key = RESEARCH_TOOL_ARG_KEYS[name];
  if (!key || !isPlainObject(args)) return null;
  const value = args[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, ARG_SUMMARY_MAX_CHARS);
}

/** Progress text shown while the run fetches an extra K-line window mid-research. */
export function analystExtraKlineActivity(period: string): string {
  const label = KLINE_PERIOD_LABELS[period];
  if (getInterfaceLocale() === 'en-US') {
    return `Fetching extra ${label ? label['en-US'] : period} K-line`;
  }
  return `正在补拉 ${label ? label['zh-CN'] : period} K 线`;
}

export function analystStatusText(key: AnalystStatusKey): string {
  return pick(STATUS_LABELS[key]);
}

function describeFetchKline(args: unknown): string {
  const period = isPlainObject(args) && typeof args.period === 'string' ? args.period : undefined;
  if (period === 'day') {
    return getInterfaceLocale() === 'en-US' ? 'Reading daily K-line' : '正在读日 K 线';
  }
  const label = period ? KLINE_PERIOD_LABELS[period] : undefined;
  if (getInterfaceLocale() === 'en-US') {
    return label ? `Reading ${label['en-US']} K-line` : 'Reading K-line';
  }
  return label ? `正在读 ${label['zh-CN']} K 线` : '正在读 K 线';
}

export function describeToolCall(name: string, args: unknown): string {
  if (name === 'fetch_kline') return describeFetchKline(args);

  const fixed = FIXED_TOOL_ACTIVITIES[name];
  if (fixed) return pick(fixed);

  if (name in RESEARCH_TOOL_ARG_KEYS) {
    const summary = summarizeResearchArgs(name, args);
    if (getInterfaceLocale() === 'en-US') {
      return summary ? `Searching: ${summary}` : 'Searching reference material';
    }
    return summary ? `正在检索资料：${summary}` : '正在检索资料';
  }

  return getInterfaceLocale() === 'en-US' ? `Calling ${name}` : `正在调用 ${name}`;
}

export function describeTurnStart(turnNumber: number): string {
  return getInterfaceLocale() === 'en-US'
    ? `Reasoning round ${turnNumber}`
    : `第 ${turnNumber} 轮推理中`;
}