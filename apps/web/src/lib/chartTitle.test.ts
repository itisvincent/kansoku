import { describe, expect, it } from 'vitest';
import { localizeChartTitle } from './chartTitle';

describe('localizeChartTitle', () => {
  it('translates saved Chinese default names for an English interface', () => {
    expect(localizeChartTitle('META.US 短线多周期', 'en-US')).toBe('META.US intraday multi-timeframe');
    expect(localizeChartTitle('NVDA.US 主力资金流', 'en-US')).toBe('NVDA.US capital flow');
    expect(localizeChartTitle('cohort 对比', 'en-US')).toBe('Cohort comparison');
  });

  it('translates English default names back for a Chinese interface', () => {
    expect(localizeChartTitle('INTU.US intraday multi-timeframe', 'zh-CN')).toBe('INTU.US 短线多周期');
  });

  it('leaves custom and already-matching titles alone', () => {
    expect(localizeChartTitle('AVGO', 'en-US')).toBe('AVGO');
    expect(localizeChartTitle('Settings', 'en-US')).toBe('Settings');
    expect(localizeChartTitle('MU earnings setup 短线', 'en-US')).toBe('MU earnings setup 短线');
    expect(localizeChartTitle('META.US intraday multi-timeframe', 'en-US')).toBe(
      'META.US intraday multi-timeframe',
    );
    expect(localizeChartTitle(' 短线多周期', 'en-US')).toBe(' 短线多周期');
  });
});
