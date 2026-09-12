import { describe, expect, it } from 'vitest';
import { detectorText, localizeDetectorMarker, sepaVerdictReason } from './analysisLabels';
import { fenxingTooltip, buySellPointTooltip } from '@kansoku/core/analysis/chanlun/tooltip';
import { AUTO_SIGNAL_META, type SeriesMarker } from '@kansoku/shared/types';

describe('stored detector labels', () => {
  it('localizes generated fractal and buy-point details without losing their price or state', () => {
    const text = fenxingTooltip(
      { kind: 'top', time: 1_780_000_000, price: 123.45, confirmed: false } as Parameters<
        typeof fenxingTooltip
      >[0],
      '4h',
    );
    const english = detectorText(text, 'en-US');
    expect(english).toContain('Top fractal');
    expect(english).toContain('$123.45');
    expect(english).toContain('unconfirmed');
    expect(english).not.toMatch(/\p{Script=Han}/u);
    expect(detectorText(text, 'zh-CN')).toBe(text);
    const point = buySellPointTooltip({
      kind: 'buy1',
      time: 1_780_000_000,
      price: 90,
      timeframe: '4h',
      confirmed: true,
    });
    expect(detectorText(point, 'en-US')).not.toMatch(/\p{Script=Han}/u);
  });
  it('preserves authored annotations and original marker data', () => {
    const marker: SeriesMarker = {
      time: 1,
      position: 'aboveBar',
      color: 'red',
      shape: 'circle',
      group: 'ai',
      text: '我的顶背离笔记',
      tooltip: '原文：价格下跌，请保留',
    };
    expect(localizeDetectorMarker(marker, 'en-US')).toBe(marker);
    for (const meta of Object.values(AUTO_SIGNAL_META))
      expect(detectorText(meta.impact, 'en-US')).not.toMatch(/\p{Script=Han}/u);
    expect(sepaVerdictReason('我的分析：趋势模板仍需复核', 'en-US')).toBe(
      '我的分析：趋势模板仍需复核',
    );
  });
  it('translates generated AI headings and anchors while preserving the saved annotation', () => {
    const marker: SeriesMarker = {
      time: 1,
      position: 'aboveBar',
      color: 'red',
      shape: 'circle',
      group: 'ai',
      text: '⚡',
      tooltip: '⚡ AI 标注信号\n我的分析：价格仍需确认',
    };
    expect(localizeDetectorMarker(marker, 'en-US').tooltip).toBe(
      '⚡ AI signal\n我的分析：价格仍需确认',
    );
    const anchor = localizeDetectorMarker(
      {
        ...marker,
        text: '🎯 做多',
        tooltip: '🎯 AI 预测锚点\n1小时 · 09/12 10:00 · $123.45\n方向判断（做多）基于这根 K 线做出',
      },
      'en-US',
    );
    expect(anchor.text).toBe('🎯 Long');
    expect(anchor.tooltip).toContain('1h · 09/12 10:00 · $123.45');
    expect(anchor.tooltip).not.toMatch(/\p{Script=Han}/u);
  });
});
