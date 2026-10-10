import { describe, expect, it } from 'vitest';
import { translate } from './i18n';
import { industryLabel, marketSessionLabel, tradeDirectionLabel } from './marketLabels';

describe('marketSessionLabel', () => {
  it('translates the English provider label "pre" into the locale string', () => {
    expect(marketSessionLabel('pre', 'en-US')).toBe(translate('en-US', 'marketSessionPre'));
    expect(marketSessionLabel('pre', 'zh-CN')).toBe(translate('zh-CN', 'marketSessionPre'));
  });

  it('translates the English provider label "regular" into the locale string', () => {
    expect(marketSessionLabel('regular', 'en-US')).toBe(translate('en-US', 'marketSessionRegular'));
    expect(marketSessionLabel('regular', 'zh-CN')).toBe(translate('zh-CN', 'marketSessionRegular'));
  });

  it('translates the Chinese provider label "盘前" into the locale string', () => {
    expect(marketSessionLabel('盘前', 'en-US')).toBe(translate('en-US', 'marketSessionPre'));
    expect(marketSessionLabel('盘前', 'zh-CN')).toBe(translate('zh-CN', 'marketSessionPre'));
  });

  it('translates the Chinese provider label "夜盘" into the locale string', () => {
    expect(marketSessionLabel('夜盘', 'en-US')).toBe(translate('en-US', 'marketSessionOvernight'));
    expect(marketSessionLabel('夜盘', 'zh-CN')).toBe(translate('zh-CN', 'marketSessionOvernight'));
  });

  it('returns an unknown value unchanged', () => {
    expect(marketSessionLabel('unknown-session', 'en-US')).toBe('unknown-session');
    expect(marketSessionLabel('unknown-session', 'zh-CN')).toBe('unknown-session');
  });
});

describe('tradeDirectionLabel', () => {
  it('translates "long" into the locale string', () => {
    expect(tradeDirectionLabel('long', 'en-US')).toBe(translate('en-US', 'homeLongDirection'));
    expect(tradeDirectionLabel('long', 'zh-CN')).toBe(translate('zh-CN', 'homeLongDirection'));
  });

  it('translates "short" into the locale string', () => {
    expect(tradeDirectionLabel('short', 'en-US')).toBe(translate('en-US', 'homeShortDirection'));
    expect(tradeDirectionLabel('short', 'zh-CN')).toBe(translate('zh-CN', 'homeShortDirection'));
  });

  it('translates "neutral" into the locale string', () => {
    expect(tradeDirectionLabel('neutral', 'en-US')).toBe(translate('en-US', 'homeWaitDirection'));
    expect(tradeDirectionLabel('neutral', 'zh-CN')).toBe(translate('zh-CN', 'homeWaitDirection'));
  });

  it('returns an unknown value unchanged', () => {
    expect(tradeDirectionLabel('unknown-direction', 'en-US')).toBe('unknown-direction');
    expect(tradeDirectionLabel('unknown-direction', 'zh-CN')).toBe('unknown-direction');
  });
});

describe('industryLabel', () => {
  it('translates a single known industry part', () => {
    expect(industryLabel('半导体', 'en-US')).toBe(translate('en-US', 'industrySemiconductors'));
    expect(industryLabel('半导体', 'zh-CN')).toBe(translate('zh-CN', 'industrySemiconductors'));
  });

  it('translates each part of a multi-part industry and keeps the " · " separator', () => {
    const multiPart = '半导体 · 存储';
    const enExpected = `${translate('en-US', 'industrySemiconductors')} · ${translate('en-US', 'industryMemory')}`;
    const zhExpected = `${translate('zh-CN', 'industrySemiconductors')} · ${translate('zh-CN', 'industryMemory')}`;
    expect(industryLabel(multiPart, 'en-US')).toBe(enExpected);
    expect(industryLabel(multiPart, 'zh-CN')).toBe(zhExpected);
  });

  it('translates a three-part industry and keeps both " · " separators', () => {
    const multiPart = '半导体 · 存储 · 巨头';
    const enExpected = [
      translate('en-US', 'industrySemiconductors'),
      translate('en-US', 'industryMemory'),
      translate('en-US', 'industryMegacaps'),
    ].join(' · ');
    const zhExpected = [
      translate('zh-CN', 'industrySemiconductors'),
      translate('zh-CN', 'industryMemory'),
      translate('zh-CN', 'industryMegacaps'),
    ].join(' · ');
    expect(industryLabel(multiPart, 'en-US')).toBe(enExpected);
    expect(industryLabel(multiPart, 'zh-CN')).toBe(zhExpected);
  });

  it('leaves unknown parts unchanged and keeps the " · " separator', () => {
    const mixed = '半导体 · unknown-industry';
    expect(industryLabel(mixed, 'en-US')).toBe(
      `${translate('en-US', 'industrySemiconductors')} · unknown-industry`,
    );
    expect(industryLabel(mixed, 'zh-CN')).toBe(
      `${translate('zh-CN', 'industrySemiconductors')} · unknown-industry`,
    );
  });

  it('returns a fully unknown value unchanged', () => {
    expect(industryLabel('unknown-industry', 'en-US')).toBe('unknown-industry');
    expect(industryLabel('unknown-industry', 'zh-CN')).toBe('unknown-industry');
  });
});
