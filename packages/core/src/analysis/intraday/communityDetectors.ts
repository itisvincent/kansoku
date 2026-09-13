// 社区形态检测器 —— 原创实现，仅覆盖 auto-patterns 档（123 结构 / SB 二次突破 /
// 价格背离 / MACD 背离 / 蜡烛形态）。语义对齐公开契约 @kansoku/pro-api/detectors
// 与公开渲染代码（markers.ts / orchestrator.ts / useIntradayCharts.ts）。
//
// 只在本地测试构建（KANSOKU_LOCAL_TEST_BUILD 构建期烧录）里由
// apps/desktop/src/edition/pro.ts 注册；开源/正式构建保持 null，absent 语义不变。
// pro overlay 在位时会投影替换 edition/pro.ts，真实 pro 组合天然优先。
// 全部为"简化算法，仅供参考"级别：摆动点用 ±3 窗口法，蜡烛形态用教科书阈值。
import type { PatternScoringContext, ProDetectors } from '@kansoku/pro-api';
import type {
  CandlePattern,
  CandlePatternKind,
  DivergencePair,
  DivergencePoint,
  Pattern123,
  SecondBreakout,
  SwingPoint,
} from '@kansoku/shared/types';

const SWING_WINDOW = 3; // 与 indicators.findSwings 同参
const SB_MIN_GAP = SWING_WINDOW; // 二次尝试距首次极值至少一个摆动窗口
const P123_STATUS_CAP = 40; // 蜡烛形态确认扫描的最大前瞻根数
const EXPIRE_BARS = 20;

interface IndexedPivot {
  idx: number;
  point: SwingPoint;
  type: 'H' | 'L';
}

// 与 indicators.findSwings 同一窗口语义，但保留下标（123/SB/背离都要按柱位回看）。
function indexedSwings(highs: number[], lows: number[], timesTs: number[]): IndexedPivot[] {
  const out: IndexedPivot[] = [];
  const n = highs.length;
  for (let i = SWING_WINDOW; i < n - SWING_WINDOW; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - SWING_WINDOW; j <= i + SWING_WINDOW; j++) {
      if (j === i) continue;
      if (highs[j] > highs[i]) isHigh = false;
      if (lows[j] < lows[i]) isLow = false;
    }
    if (isHigh) out.push({ idx: i, point: { time: timesTs[i], price: highs[i] }, type: 'H' });
    if (isLow) out.push({ idx: i, point: { time: timesTs[i], price: lows[i] }, type: 'L' });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// ---------- 价格背离：相邻摆动点，价创新高而柱值走低（顶背离），镜像为底背离 ----------
export function findPriceDivergence(points: DivergencePoint[], isTop: boolean): DivergencePair[] {
  const out: DivergencePair[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!Number.isFinite(a.macd_value) || !Number.isFinite(b.macd_value)) continue;
    if (isTop) {
      if (b.price > a.price && b.macd_value < a.macd_value) out.push({ kind: 'top', a, b });
    } else if (b.price < a.price && b.macd_value > a.macd_value) {
      out.push({ kind: 'bottom', a, b });
    }
  }
  return out;
}

// ---------- MACD 背离：自行找摆动点，读柱值后复用同一判定 ----------
export function findMacdBeichi(
  hist: (number | null)[],
  highs: number[],
  lows: number[],
  timesTs: number[],
): DivergencePair[] {
  const out: DivergencePair[] = [];
  for (const type of ['H', 'L'] as const) {
    const pts: DivergencePoint[] = [];
    for (const p of indexedSwings(highs, lows, timesTs)) {
      if (p.type !== type) continue;
      const v = hist[p.idx];
      if (v == null || !Number.isFinite(v)) continue;
      pts.push({ ...p.point, macd_value: v });
    }
    out.push(...findPriceDivergence(pts, type === 'H'));
  }
  return out;
}

// ---------- 123 结构：①②③ 为连续三个异向摆动点，③ 不破 ①（更高低点/更低高点），
// 收盘越过 ② 确认；收盘破 ③ 则作废。 ----------
function confirmFrom(
  fromIdx: number,
  trigger: number,
  invalidation: number,
  bullish: boolean,
  closes: number[],
  timesTs: number[],
): { status: 'forming' | 'confirmed'; confirm: SwingPoint | null; dead: boolean } {
  const cap = Math.min(closes.length, fromIdx + P123_STATUS_CAP);
  for (let i = fromIdx; i < cap; i++) {
    if (bullish ? closes[i] > trigger : closes[i] < trigger) {
      return { status: 'confirmed', confirm: { time: timesTs[i], price: closes[i] }, dead: false };
    }
    if (bullish ? closes[i] < invalidation : closes[i] > invalidation) {
      return { status: 'forming', confirm: null, dead: true };
    }
  }
  return { status: 'forming', confirm: null, dead: false };
}

export function detect123Patterns(
  highs: number[],
  lows: number[],
  closes: number[],
  timesTs: number[],
): Pattern123[] {
  const pivots = indexedSwings(highs, lows, timesTs);
  const out: Pattern123[] = [];
  for (let i = 2; i < pivots.length; i++) {
    const [p1, p2, p3] = [pivots[i - 2], pivots[i - 1], pivots[i]];
    if (p1.type !== p3.type || p2.type === p1.type) continue; // 必须是 低高低 / 高低高
    const bullish = p3.type === 'L';
    const higherLow = bullish && p3.point.price > p1.point.price;
    const lowerHigh = !bullish && p3.point.price < p1.point.price;
    if (!higherLow && !lowerHigh) continue;
    const trigger = p2.point.price;
    const invalidation = p3.point.price;
    const { status, confirm, dead } = confirmFrom(p3.idx + 1, trigger, invalidation, bullish, closes, timesTs);
    if (dead) continue; // 被跌破/突破作废的酝酿结构不显示
    out.push({
      kind: bullish ? 'bullish' : 'bearish',
      status,
      p1: p1.point,
      p2: p2.point,
      p3: p3.point,
      trigger,
      invalidation,
      confirm,
      label: bullish ? '123 底' : '123 顶',
      implication: bullish
        ? '回调不破前低，收盘站上 ② 后结构成立，看反弹延续'
        : '反抽不过前高，收盘跌破 ② 后结构成立，看回落延续',
    });
  }
  return out;
}

// ---------- SB 二次突破：摆动极值 ①（H1/L1），回撤后第二次上攻/下探：
// 触碰未收盘突破 → 酝酿中；收盘突破 → 确认，trigger 记信号柱与被破价位。 ----------
export function detectSecondBreakouts(
  highs: number[],
  lows: number[],
  closes: number[],
  timesTs: number[],
): SecondBreakout[] {
  const pivots = indexedSwings(highs, lows, timesTs);
  const out: SecondBreakout[] = [];
  for (const [pi, pivot] of pivots.entries()) {
    const bullish = pivot.type === 'H';
    const level = pivot.point.price;
    // 扫描截止到下一个同向摆动点（再往后级别已被更新，重测无意义）
    const nextSame = pivots
      .slice(pi + 1)
      .find((q) => q.type === pivot.type && (bullish ? q.point.price > level : q.point.price < level));
    const endIdx = nextSame ? nextSame.idx : closes.length;
    let lastPokeIdx = -1;
    let confirmed: SwingPoint | null = null;
    for (let i = pivot.idx + SB_MIN_GAP; i < endIdx; i++) {
      const touched = bullish ? highs[i] >= level : lows[i] <= level;
      const broke = bullish ? closes[i] > level : closes[i] < level;
      if (broke) {
        confirmed = { time: timesTs[i], price: closes[i] };
        break;
      }
      if (touched) lastPokeIdx = i;
    }
    const signal = confirmed ?? (lastPokeIdx >= 0 ? { time: timesTs[lastPokeIdx], price: level } : null);
    if (!signal) continue;
    out.push({
      kind: bullish ? 'H2' : 'L2',
      status: confirmed ? 'confirmed' : 'forming',
      first: pivot.point,
      signal,
      trigger: confirmed ? { time: signal.time, price: level } : null,
    });
  }
  return out;
}

// ---------- 蜡烛形态：教科书阈值 + 3 根本地趋势门（上下文类形态要求前置涨/跌） ----------
interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
}

const body = (b: Bar) => Math.abs(b.c - b.o);
const upper = (b: Bar) => b.h - Math.max(b.o, b.c);
const lower = (b: Bar) => Math.min(b.o, b.c) - b.l;
const range = (b: Bar) => b.h - b.l || 1e-9;
const isBull = (b: Bar) => b.c > b.o;
const isBear = (b: Bar) => b.c < b.o;

type Trend = 'up' | 'down' | 'flat' | null;
function trendBefore(closes: number[], i: number, look = 4): Trend {
  if (i < look) return null;
  const drift = closes[i - 1] - closes[i - look];
  if (drift > 0) return 'up';
  if (drift < 0) return 'down';
  return 'flat';
}

interface PatternDef {
  kind: CandlePatternKind;
  bias: 'bullish' | 'bearish' | 'neutral';
  label: string;
  implication: string;
  span: number;
  confirm_price?: number;
  invalidate_price?: number;
}

const PATTERN_META: Record<CandlePatternKind, { label: string; implication: string; bias: 'bullish' | 'bearish' | 'neutral'; base: number }> = {
  bullish_engulfing: { label: '看涨吞没', implication: '阳线实体包住前阴线，短线反转偏多', bias: 'bullish', base: 55 },
  bearish_engulfing: { label: '看跌吞没', implication: '阴线实体包住前阳线，短线反转偏空', bias: 'bearish', base: 55 },
  morning_star: { label: '晨星', implication: '下跌末端三柱反转组合，看反弹', bias: 'bullish', base: 62 },
  evening_star: { label: '暮星', implication: '上涨末端三柱反转组合，看回落', bias: 'bearish', base: 62 },
  hammer: { label: '锤子线', implication: '下影探底后收回，下跌末端偏多', bias: 'bullish', base: 48 },
  hanging_man: { label: '上吊线', implication: '涨势末端出现长下影，警惕见顶', bias: 'bearish', base: 46 },
  inverted_hammer: { label: '倒锤线', implication: '跌势末端上攻未果但收复大半，偏多试探', bias: 'bullish', base: 46 },
  shooting_star: { label: '流星线', implication: '涨势末端上冲回落留长上影，偏空', bias: 'bearish', base: 48 },
  pin_bar_lower: { label: '多头针形', implication: '下影占全柱六成以上，拒绝新低', bias: 'bullish', base: 50 },
  pin_bar_upper: { label: '空头针形', implication: '上影占全柱六成以上，拒绝新高', bias: 'bearish', base: 50 },
  dark_cloud_cover: { label: '乌云压顶', implication: '高开后杀入前阳线实体中部，偏空', bias: 'bearish', base: 56 },
  piercing_line: { label: '刺透线', implication: '低开后收进前阴线实体中部，偏多', bias: 'bullish', base: 56 },
  bullish_harami: { label: '看涨孕线', implication: '小实体孕于前阴线内，下跌动能衰减', bias: 'bullish', base: 42 },
  bearish_harami: { label: '看跌孕线', implication: '小实体孕于前阳线内，上涨动能衰减', bias: 'bearish', base: 42 },
  three_white_soldiers: { label: '红三兵', implication: '连续三根实体阳线推升，多头延续', bias: 'bullish', base: 60 },
  three_black_crows: { label: '三只乌鸦', implication: '连续三根实体阴线压低，空头延续', bias: 'bearish', base: 60 },
  doji: { label: '十字星', implication: '开盘收盘几乎持平，方向未定', bias: 'neutral', base: 36 },
  long_legged_doji: { label: '长脚十字', implication: '多空大幅拉锯后回到原点，变盘信号', bias: 'neutral', base: 40 },
  gravestone_doji: { label: '墓碑十字', implication: '上攻全数回吐，偏空', bias: 'bearish', base: 42 },
  dragonfly_doji: { label: '蜻蜓十字', implication: '下探全数收复，偏多', bias: 'bullish', base: 42 },
  tweezer_top: { label: '镊子顶', implication: '两柱几乎同高点，涨势受阻', bias: 'bearish', base: 44 },
  tweezer_bottom: { label: '镊子底', implication: '两柱几乎同低点，跌势受阻', bias: 'bullish', base: 44 },
  bullish_marubozu: { label: '光头光脚阳线', implication: '几乎无影线的大阳线，多头动能强劲', bias: 'bullish', base: 44 },
  bearish_marubozu: { label: '光头光脚阴线', implication: '几乎无影线的大阴线，空头动能强劲', bias: 'bearish', base: 44 },
};

// 每柱只出最高优先级的一个形态，避免同柱堆叠多个标记
const PRIORITY: CandlePatternKind[] = [
  'morning_star',
  'evening_star',
  'three_white_soldiers',
  'three_black_crows',
  'bullish_engulfing',
  'bearish_engulfing',
  'dark_cloud_cover',
  'piercing_line',
  'hammer',
  'hanging_man',
  'shooting_star',
  'inverted_hammer',
  'pin_bar_lower',
  'pin_bar_upper',
  'bullish_marubozu',
  'bearish_marubozu',
  'bullish_harami',
  'bearish_harami',
  'tweezer_top',
  'tweezer_bottom',
  'gravestone_doji',
  'dragonfly_doji',
  'long_legged_doji',
  'doji',
];

function detectAt(bars: Bar[], i: number, trend: Trend): PatternDef | null {
  const b = bars[i];
  const p = i >= 1 ? bars[i - 1] : null;
  const p2 = i >= 2 ? bars[i - 2] : null;
  const bd = body(b);
  const r = range(b);
  const matches = new Set<CandlePatternKind>();

  // 单柱：十字家族 / 锤族 / 针形
  if (bd <= 0.1 * r) {
    if (upper(b) >= 0.5 * r && lower(b) <= 0.1 * r) matches.add('gravestone_doji');
    else if (lower(b) >= 0.5 * r && upper(b) <= 0.1 * r) matches.add('dragonfly_doji');
    else if (upper(b) >= 0.35 * r && lower(b) >= 0.35 * r) matches.add('long_legged_doji');
    else matches.add('doji');
  }
  if (bd > 0 && lower(b) >= 2 * bd && upper(b) <= bd) {
    if (trend === 'down') matches.add('hammer');
    else if (trend === 'up') matches.add('hanging_man');
  }
  if (bd > 0 && upper(b) >= 2 * bd && lower(b) <= bd) {
    if (trend === 'down') matches.add('inverted_hammer');
    else if (trend === 'up') matches.add('shooting_star');
  }
  if (lower(b) >= 0.66 * r && bd <= 0.25 * r) matches.add('pin_bar_lower');
  if (upper(b) >= 0.66 * r && bd <= 0.25 * r) matches.add('pin_bar_upper');
  if (bd >= 0.9 * r) matches.add(isBull(b) ? 'bullish_marubozu' : 'bearish_marubozu');

  if (p) {
    // 两柱：吞没 / 乌云 / 刺透 / 孕线 / 镊子（吞没要求趋势门，无趋势不降级误标）
    if (trend === 'down' && isBear(p) && isBull(b) && b.o <= p.c && b.c >= p.o && body(p) > 0) {
      matches.add('bullish_engulfing');
    }
    if (trend === 'up' && isBull(p) && isBear(b) && b.o >= p.c && b.c <= p.o && body(p) > 0) {
      matches.add('bearish_engulfing');
    }
    const mid = (p.o + p.c) / 2;
    if (trend === 'up' && isBull(p) && b.o >= p.c && isBear(b) && b.c <= mid && b.c > p.o) {
      matches.add('dark_cloud_cover');
    }
    if (trend === 'down' && isBear(p) && b.o <= p.c && isBull(b) && b.c >= mid && b.c < p.o) {
      matches.add('piercing_line');
    }
    if (isBear(p) && isBull(b) && b.o > p.c && b.c < p.o) matches.add('bullish_harami');
    if (isBull(p) && isBear(b) && b.o < p.c && b.c > p.o) matches.add('bearish_harami');
    const tol = 0.002 * Math.max(p.h, b.h);
    if (trend === 'up' && Math.abs(p.h - b.h) <= tol) matches.add('tweezer_top');
    if (trend === 'down' && Math.abs(p.l - b.l) <= tol) matches.add('tweezer_bottom');
  }

  if (p && p2) {
    // 三柱：晨星 / 暮星 / 红三兵 / 三乌鸦
    const mid1 = (p2.o + p2.c) / 2;
    if (
      trend === 'down' &&
      isBear(p2) &&
      body(p) <= 0.5 * body(p2) &&
      p.c < p2.c &&
      isBull(b) &&
      b.c > mid1
    ) {
      matches.add('morning_star');
    }
    if (
      trend === 'up' &&
      isBull(p2) &&
      body(p) <= 0.5 * body(p2) &&
      p.c > p2.c &&
      isBear(b) &&
      b.c < mid1
    ) {
      matches.add('evening_star');
    }
    const strong = (x: Bar) => isBull(x) && body(x) >= 0.5 * range(x);
    if (strong(p2) && strong(p) && strong(b) && p2.c < p.c && p.c < b.c) {
      matches.add('three_white_soldiers');
    }
    const strongD = (x: Bar) => isBear(x) && body(x) >= 0.5 * range(x);
    if (strongD(p2) && strongD(p) && strongD(b) && p2.c > p.c && p.c > b.c) {
      matches.add('three_black_crows');
    }
  }

  const best = PRIORITY.find((k) => matches.has(k));
  if (!best) return null;
  const meta = PATTERN_META[best];
  const bullish = meta.bias === 'bullish';
  const neutral = meta.bias === 'neutral';
  const THREE_BAR = new Set<CandlePatternKind>([
    'morning_star',
    'evening_star',
    'three_white_soldiers',
    'three_black_crows',
  ]);
  const TWO_BAR = new Set<CandlePatternKind>([
    'bullish_engulfing',
    'bearish_engulfing',
    'dark_cloud_cover',
    'piercing_line',
    'bullish_harami',
    'bearish_harami',
    'tweezer_top',
    'tweezer_bottom',
  ]);
  return {
    kind: best,
    bias: meta.bias,
    label: meta.label,
    implication: meta.implication,
    span: THREE_BAR.has(best) ? 3 : TWO_BAR.has(best) ? 2 : 1,
    confirm_price: neutral ? undefined : bullish ? b.h : b.l,
    invalidate_price: neutral ? undefined : bullish ? b.l : b.h,
  };
}

export function detectCandlePatterns(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  timesTs: number[],
): CandlePattern[] {
  const bars: Bar[] = opens.map((o, i) => ({ o, h: highs[i], l: lows[i], c: closes[i] }));
  const out: CandlePattern[] = [];
  for (let i = 0; i < bars.length; i++) {
    const def = detectAt(bars, i, trendBefore(closes, i));
    if (!def) continue;
    out.push({ ...def, time: timesTs[i], price: closes[i] });
  }
  return out;
}

// ---------- 打分与状态：量能 + 位置加分，前瞻扫描确认/失效 ----------
export function enrichCandlePatterns(
  patterns: CandlePattern[],
  ctx: PatternScoringContext,
): CandlePattern[] {
  const idxByTime = new Map<number, number>();
  ctx.timesTs.forEach((t, i) => idxByTime.set(t, i));
  const recentLows = ctx.swingLows.slice(-5);
  const recentHighs = ctx.swingHighs.slice(-5);

  const avgVol = (endExclusive: number, window = 20): number => {
    const from = Math.max(0, endExclusive - window);
    let sum = 0;
    let n = 0;
    for (let j = from; j < endExclusive; j++) {
      const v = ctx.vols[j];
      if (Number.isFinite(v)) {
        sum += v;
        n++;
      }
    }
    return n ? sum / n : 0;
  };

  return patterns.map((p) => {
    const meta = PATTERN_META[p.kind];
    let score = meta.base;
    const i = idxByTime.get(p.time) ?? -1;
    if (i >= 0) {
      const v = ctx.vols[i];
      const avg = avgVol(i);
      if (avg > 0 && Number.isFinite(v)) {
        if (v >= 1.5 * avg) score += 12;
        else if (v <= 0.7 * avg) score -= 6;
      }
      const near = (points: SwingPoint[], price: number) =>
        points.some((q) => Math.abs(q.price - price) <= 0.005 * price);
      if (p.bias === 'bullish' && near(recentLows, p.price)) score += 10;
      if (p.bias === 'bearish' && near(recentHighs, p.price)) score += 10;

      // 前瞻：确认价先到 → confirmed；失效价先到 → invalidated；超期 → expired
      if (p.confirm_price != null && p.invalidate_price != null && p.bias !== 'neutral') {
        const bullish = p.bias === 'bullish';
        const span = p.span ?? 1;
        const cap = Math.min(ctx.closes.length, i + span + EXPIRE_BARS);
        let status: CandlePattern['status'] = 'pending';
        for (let j = i + span; j < cap; j++) {
          const c = ctx.closes[j];
          if (bullish ? c > p.confirm_price : c < p.confirm_price) {
            status = 'confirmed';
            break;
          }
          if (bullish ? c < p.invalidate_price : c > p.invalidate_price) {
            status = 'invalidated';
            break;
          }
        }
        if (status === 'pending' && i + span + EXPIRE_BARS < ctx.closes.length) {
          status = 'expired';
        }
        return { ...p, score: Math.max(0, Math.min(100, Math.round(score))), status };
      }
    }
    return { ...p, score: Math.max(0, Math.min(100, Math.round(score))), status: null };
  });
}

// 期权墙需要期权持仓数据源，社区实现先诚实返回 null（该档解锁后暂无数据）。
export function communityDetectors(): ProDetectors {
  return {
    findPriceDivergence,
    findMacdBeichi,
    detect123Patterns,
    detectSecondBreakouts,
    detectCandlePatterns,
    enrichCandlePatterns,
    getOptionsLevels: async () => null,
  };
}