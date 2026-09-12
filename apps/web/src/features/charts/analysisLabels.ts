import type { Locale } from '@web/lib/i18n';
import type { SeriesMarker } from '@kansoku/shared/types';

// Older chart snapshots store computed labels as Chinese text. Translate only
// the detector vocabulary here; authored notes and AI annotations keep their text.
const labels: Record<string, string> = {
  '顶背离': 'Bearish divergence',
  '底背离': 'Bullish divergence',
  '顶 MACD 背离（K 线级）': 'Bearish MACD divergence (candle level)',
  '底 MACD 背离（K 线级）': 'Bullish MACD divergence (candle level)',
  '价格创新高但 MACD 动能走弱——上涨动力在衰减，警惕滞涨回调；若随后跌破前低即确认转弱':
    'Price makes a higher high while MACD weakens. Upward momentum is fading; a break below the previous low confirms weakness.',
  '价格创新低但 MACD 动能走强——抛压在衰减，反弹概率上升；若放量收复前高即确认反转':
    'Price makes a lower low while MACD strengthens. Selling pressure is fading; reclaiming the previous high on higher volume confirms a reversal.',
  '这波上冲的推动力比前一波明显缩小——趋势进入末段，追高风险大':
    'This advance has much less momentum than the previous one. The trend may be nearing its end; chasing higher prices carries risk.',
  '这波下杀的推动力比前一波明显缩小——下跌动能趋于枯竭，接近阶段性底部':
    'This decline has much less momentum than the previous one. Downward momentum may be exhausting near a local bottom.',
  '零上金叉': 'Bullish cross above zero',
  '零下金叉': 'Bullish cross below zero',
  '零上死叉': 'Bearish cross above zero',
  '零下死叉': 'Bearish cross below zero',
  '二次金叉': 'Second bullish cross',
  '空中加油': 'Bullish continuation',
  '二次死叉': 'Second bearish cross',
  '上穿零轴': 'Cross above zero',
  '下穿零轴': 'Cross below zero',
  '多头趋势中的回调结束，上涨延续概率大，可靠性高':
    'A pullback in an uptrend may have ended, supporting upward continuation.',
  '下跌途中的超跌反弹，通常只是修复，反弹后仍可能回落；反转需等二次金叉或 DIF 上穿零轴':
    'A rebound within a decline may fade. Wait for a second bullish cross or DIF crossing above zero to confirm reversal.',
  '上涨中的回调警告，趋势未必转坏，关注回调深度与零轴支撑':
    'A pullback warning within an advance. Watch its depth and support at the zero line.',
  '空头趋势延续，下跌可能加速，不宜抄底':
    'The downtrend continues and may accelerate. Avoid buying solely because prices have fallen.',
  '零下二次金叉且低点抬高——底部结构确认，反转概率显著上升，比单次金叉可靠得多':
    'A second bullish cross below zero with higher lows confirms a bottoming structure, strengthening the reversal signal.',
  '零上二次金叉（回调不破零轴再度金叉）——强势延续，常开启第二波上涨':
    'A second bullish cross while holding above zero supports continuation and a possible second advance.',
  '零上二次死叉且高点降低——顶部结构确认，转跌概率显著上升':
    'A second bearish cross above zero with lower highs confirms a topping structure and increases downside risk.',
  '零下二次死叉——空头中继，下跌延续甚至加速':
    'A second bearish cross below zero supports continued or accelerating decline.',
  'DIF 上穿零轴——中期动能由空转多的确认信号，比金叉滞后但更可靠':
    'DIF crosses above zero, confirming a shift to positive momentum. It lags a bullish cross but offers stronger confirmation.',
  'DIF 下穿零轴——中期动能由多转空的确认信号':
    'DIF crosses below zero, confirming a shift to negative momentum.',
  '⚠️ 当前 DIF 贴近零轴反复缠绕（震荡市），交叉信号可靠性下降，宜用区间打法':
    '⚠️ DIF repeatedly crosses near zero in a range. Crossover signals are less reliable; consider range conditions.',
  '顶分型': 'Top fractal',
  '底分型': 'Bottom fractal',
  '中间 K 高点严格最高、低点也不低于两侧':
    'The middle candle has the highest high and a low no lower than either neighbor.',
  '中间 K 低点严格最低、高点也不高于两侧':
    'The middle candle has the lowest low and a high no higher than either neighbor.',
  '局部反转信号——但分型只是"结构材料"，单个分型不足以判定方向，需等下一笔配合确认。':
    'A possible local reversal. A single fractal does not establish direction; wait for the next stroke to confirm. ',
  '未确认状态下，若下一根 K 线创新高，此顶分型作废':
    'While unconfirmed, a higher high in the next candle invalidates this top fractal.',
  '未确认状态下，若下一根 K 线创新低，此底分型作废':
    'While unconfirmed, a lower low in the next candle invalidates this bottom fractal.',
  '相邻反向分型之间的连接，至少 5 根 K 线间隔':
    'A connection between neighboring opposite fractals, separated by at least five candles.',
  '短线方向已定——当前为上笔说明短线多头占优。笔本身不是趋势，随时可能被反向笔打断；只有多笔累积成线段才具备趋势意义':
    'An upward stroke indicates short-term buying strength. A stroke alone is not a trend; several strokes must form a segment.',
  '短线方向已定——当前为下笔说明短线空头占优。笔本身不是趋势，随时可能被反向笔打断；只有多笔累积成线段才具备趋势意义':
    'A downward stroke indicates short-term selling strength. A stroke alone is not a trend; several strokes must form a segment.',
  '至少 3 笔组成，有价格覆盖': 'At least three strokes with overlapping price ranges.',
  '中期趋势成型——上线段进行中即中期力量偏多。线段的"破坏"（反向段确立）通常是趋势反转的第一信号，也是构成中枢的组件':
    'An upward segment indicates a positive medium-term trend. An established opposite segment is an early reversal signal. Segments also form consolidation centers.',
  '中期趋势成型——下线段进行中即中期力量偏空。线段的"破坏"（反向段确立）通常是趋势反转的第一信号，也是构成中枢的组件':
    'A downward segment indicates a negative medium-term trend. An established opposite segment is an early reversal signal. Segments also form consolidation centers.',
  '连续 3 段线段的价格重叠区': 'The overlapping price range of three consecutive segments.',
  '多空分歧区——市场在此形成阶段性平衡。三种走向决定后市：':
    'A temporary balance between buyers and sellers. Three possible paths:',
  '▲ 上破 + 回踩不破 → 三类买点，趋势向上升级':
    '▲ Breakout with a successful retest → Type 3 buy point; upward continuation.',
  '▼ 下破 + 反抽不破 → 三类卖点，趋势向下升级':
    '▼ Breakdown with a failed reclaim → Type 3 sell point; downward continuation.',
  '⬜ 继续震荡 → 中枢延续，等待方向选择':
    '⬜ Continued ranging → The center persists; wait for direction.',
  '一类买点': 'Type 1 buy',
  '一类卖点': 'Type 1 sell',
  '二类买点': 'Type 2 buy',
  '二类卖点': 'Type 2 sell',
  '三类买点': 'Type 3 buy',
  '三类卖点': 'Type 3 sell',
  '下跌线段末端出现段间底背驰': 'Bullish divergence between segments at the end of a decline.',
  '上涨线段末端出现段间顶背驰': 'Bearish divergence between segments at the end of an advance.',
  '一类点后反弹回调不破一类点': 'The pullback after a rebound holds above the Type 1 point.',
  '一类点后回落反抽不破一类点': 'The rebound after a decline stays below the Type 1 point.',
  '中枢向上突破后回调不破中枢边沿':
    'After an upward breakout, the retest holds above the center boundary.',
  '中枢向下突破后反抽不破中枢边沿':
    'After a downward breakout, the rebound stays below the center boundary.',
  '趋势转折的最强信号——价格新低但动能不足。风险："背驰不是终点"，严格执行需等次级别买点确认':
    'A reversal signal: a new price low with weakening momentum. Divergence can persist; wait for a buy point on a smaller timeframe.',
  '趋势转折的最强信号——价格新高但动能不足。风险："背驰不是终点"，严格执行需等次级别卖点确认':
    'A reversal signal: a new price high with weakening momentum. Divergence can persist; wait for a sell point on a smaller timeframe.',
  '一类点的确认——多头接手有效。相比一类点安全，代价是错过初始反弹段':
    'Confirms the Type 1 point as buyers take over. It offers more confirmation at the cost of missing the initial rebound.',
  '一类点的确认——空头接手有效。相比一类点安全，代价是错过初始下跌段':
    'Confirms the Type 1 point as sellers take over. It offers more confirmation at the cost of missing the initial decline.',
  '中枢升级信号——多头彻底接管旧盘整区，常预示新的更高中枢形成，是"趋势中的最强买点"':
    'Buyers take control of the old consolidation range. A higher center may form, supporting a buy point within the trend.',
  '中枢升级信号——空头彻底接管旧盘整区，常预示新的更低中枢形成，是"趋势中的最强卖点"':
    'Sellers take control of the old consolidation range. A lower center may form, supporting a sell point within the trend.',
  '简化算法，仅供参考': 'Simplified algorithm; for reference only',
  '简化判定（未做特征序列分类），仅供参考':
    'Simplified detection without characteristic-sequence classification; for reference only',
  '简化背驰面积法，仅供参考': 'Simplified divergence-area method; for reference only',
  '简化判定（跳过新线段严格确认），仅供参考':
    'Simplified detection without strict new-segment confirmation; for reference only',
  '阶段': 'Stage',
  '阶段备注': 'Stage notes',
  'Base 数': 'Base count',
  '形态': 'Pattern',
  '价 > 150MA 且 > 200MA': 'Price > MA150 and MA200',
  '200MA 上行 ≥ 1 月': 'MA200 rising for at least 1 month',
  '50MA > 150MA 且 > 200MA': 'MA50 > MA150 and MA200',
  '价 > 50MA': 'Price > MA50',
  '距 52w 低 ≥ +30%': 'At least 30% above the 52-week low',
  '距 52w 高 ≤ 25% 内': 'Within 25% of the 52-week high',
  'RS > 70 分位 (vs SPY)': 'Relative strength > 70th percentile (vs SPY)',
  '无 SPY 数据，未计算': 'Not calculated: SPY data unavailable',
  '诱多区': 'Bull-trap warning zone',
  '关注区': 'Watch zone',
  '第一买点': 'First buy zone',
  '价值区': 'Value zone',
  'MA50 关注区': 'MA50 watch zone',
  '长期均线价值区': 'Long-term moving-average value zone',
  '成交密集区': 'High-volume price zone',
  '刚 climax top 后的第一次回调，主力借反弹派发——不能买':
    'First pullback after a climax top; a rebound may face renewed selling. Avoid entry without confirmation.',
  '需触及当天缩量 + ≥1 根反转 K + 大盘配合，确认后小试':
    'Look for lower volume on the test, at least one reversal candle, and a supportive market before a small entry.',
  'VDU 后放量反弹是合格信号，可分批进场':
    'A rebound on expanding volume after volume dries up can support a staged entry.',
  '成交密集区 + 长期均线交汇，机构成本带，逆向布局重点':
    'A high-volume price area near long-term moving averages; watch for confirmed support.',
};

export function analysisLabel(text: string, locale: Locale): string {
  if (locale !== 'en-US') return text;
  return (
    labels[text] ??
    text.replace(/^过去 (\d+) 日 volume profile 峰值$/, 'Volume profile peak over $1 days')
  );
}

const fragments: Record<string, string> = {
  ...labels,
  '（最新 K 线，待确认）': ' (latest candle; awaiting confirmation)',
  '已过期（3根内未触发确认或失效）': 'Expired (no confirmation or invalidation within 3 candles)',
  '（未确认）': ' (unconfirmed)',
  '未确认': 'Unconfirmed',
  '待确认': 'Pending',
  '已确认': 'Confirmed',
  '已失效': 'Invalidated',
  '自动·': 'Auto · ',
  '📖 定义：': '📖 Definition: ',
  '💡 含义：': '💡 Meaning: ',
  '状态：': 'Status: ',
  '含金量 ': 'Score ',
  '确认价 ': 'Confirmation ',
  '失效价 ': 'Invalidation ',
  '历史：样本不足': 'History: insufficient sample',
  '无方向': 'No direction',
  '收盘': 'close ',
  '站上': 'above ',
  '跌破': 'below ',
  '触发线': 'trigger ',
  '结构确认': 'Structure confirmed',
  '酝酿中：等待': 'Forming: waiting for ',
  '上线段': 'Upward segment',
  '下线段': 'Downward segment',
  '上笔': 'Upward stroke',
  '下笔': 'Downward stroke',
  '已破坏': 'Broken',
  '进行中': 'In progress',
  '盘整中': 'Consolidating',
  '已终结': 'Ended',
  '仍在延续': 'Ongoing',
  '突破中枢上沿后回调不破': 'Retest holds above the center after breakout',
  '突破中枢下沿后反抽不破': 'Rebound stays below the center after breakdown',
  '回调低': 'Pullback low',
  '反抽高': 'Rebound high',
  '一类点': 'Type 1 point',
  '背驰段：段 #': 'Divergence: segment #',
  ' vs 段 #': ' vs segment #',
  '中枢：': 'Center: ',
  '重叠区 ': 'Overlap ',
  '价 $': 'Price $',
  '1月斜率 ': '1-month slope ',
  ', 4月 ': ', 4-month ',
  '21天 ': '21 days ',
  '126天 ': '126 days ',
  '(低 $': '(low $',
  '(高 $': '(high $',
  'E 财报': 'E Earnings',
  '⬇ 跌破 MA50': '⬇ Below MA50',
  '⬇ 跌破 MA200 (Stage 3 转 Stage 4)': '⬇ Below MA200 (Stage 3 to Stage 4)',
  '52w 高 $': '52w high $',
};
const entries = Object.entries(fragments).sort((a, b) => b[0].length - a[0].length);
const vocabulary = new RegExp(
  entries.map(([key]) => key.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&')).join('|'),
  'g',
);

/** Only call for fields produced by built-in detectors, never free-form documents. */
export function detectorText(text: string, locale: Locale): string {
  if (locale !== 'en-US') return text;
  return text
    .replaceAll(/（第 (\d+) [个段笔]）/g, ' (#$1)')
    .replaceAll(/跨 (\d+) 根 K 线｜幅度 /g, '$1 candles | Change ')
    .replaceAll(/由 (\d+) 笔构成｜起 /g, '$1 strokes | From ')
    .replaceAll(/由 (\d+) 段线段构成/g, '$1 segments')
    .replaceAll(/｜\+(\d+) 段延伸/g, ' | +$1 extensions')
    .replaceAll(' 级别中枢', ' center')
    .replaceAll(/^起 /gm, 'From ')
    .replaceAll(' → 止 ', ' → To ')
    .replaceAll(' → 讫 ', ' → To ')
    .replaceAll(
      /历史：近 (\d+) 次确认后 (\d+) 次走对/g,
      'History: $2 correct out of $1 confirmations',
    )
    .replaceAll(/已于 (.+?) 收盘/g, 'Confirmed at $1: close')
    .replaceAll(' (下)', ' (down)')
    .replaceAll(' (上)', ' (up)')
    .replace(vocabulary, (match) => fragments[match]);
}

export function localizeDetectorMarker(marker: SeriesMarker, locale: Locale): SeriesMarker {
  if (locale !== 'en-US') return marker;
  if (marker.group === 'ai') {
    const directions: Record<string, string> = { 做多: 'Long', 做空: 'Short', 观望: 'Wait' };
    const anchor =
      /^🎯 AI 预测锚点\n(5分钟|15分钟|1小时)( · [^\n]+)\n方向判断（(做多|做空|观望)）基于这根 K 线做出$/.exec(
        marker.tooltip ?? '',
      );
    if (anchor) {
      const timeframe = { '5分钟': '5m', '15分钟': '15m', '1小时': '1h' }[anchor[1]];
      return {
        ...marker,
        text: `🎯 ${directions[anchor[3]]}`,
        tooltip: `🎯 AI prediction anchor\n${timeframe}${anchor[2]}\nThe ${directions[anchor[3]]} outlook was based on this candle`,
      };
    }
    // Only the generated heading is translated; the saved AI annotation remains verbatim.
    const tooltip = marker.tooltip?.replace(/^([📌⚡🌀•]+) AI 标注信号\n/u, '$1 AI signal\n');
    return tooltip === marker.tooltip ? marker : { ...marker, tooltip };
  }
  return {
    ...marker,
    text: detectorText(marker.text, locale),
    tooltip: marker.tooltip ? detectorText(marker.tooltip, locale) : undefined,
  };
}

export function sepaVerdictReason(text: string, locale: Locale): string {
  if (locale !== 'en-US') return text;
  const failed = /^趋势模板 8 条中 (\d+) 条 Fail（(.+)）→ 不满足 SEPA 入场条件。$/.exec(text);
  if (failed)
    return `${failed[1]} of 8 trend-template checks failed (${detectorText(failed[2], locale).replaceAll('、', ', ')}). SEPA entry conditions are not met.`;
  const extended =
    /^8 条全过，但距 50MA \+([\d.]+)% 已 extended（>25% 警戒）。当下不是合法入场点，等回调至 50MA 附近形成新整理平台再观察。$/.exec(
      text,
    );
  if (extended)
    return `All 8 checks pass, but price is ${extended[1]}% above MA50, beyond the 25% extension threshold. Wait for a pullback and a new base near MA50.`;
  if (
    text ===
    '8 条全过，自动检测未发现可买的整理形态（VCP / 杯柄 / 平台 / 旗形需人工目视确认）。若价位在 pivot ~ pivot+5% 买入区且当日成交量 ≥ 1.5×20MA 量，则可升为 Strong Buy。'
  )
    return 'All 8 checks pass. A tradable base still needs visual confirmation (VCP, cup and handle, flat base, or flag). Price within 5% above the pivot and volume at least 1.5× its 20-day average may support a Strong Buy rating.';
  return text;
}
