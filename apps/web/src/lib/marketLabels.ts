import { translate, type Locale, type MessageKey } from './i18n';

// Provider labels remain unchanged in stored data and grouping logic.
const sessions: Record<string, MessageKey> = {
  pre: 'marketSessionPre',
  regular: 'marketSessionRegular',
  post: 'marketSessionPost',
  overnight: 'marketSessionClosed',
  盘前: 'marketSessionPre',
  盘后: 'marketSessionPost',
  夜盘: 'marketSessionOvernight',
  日盘: 'marketSessionDay',
  休市: 'marketSessionClosed',
};
const directions: Record<string, MessageKey> = {
  long: 'homeLongDirection',
  short: 'homeShortDirection',
  neutral: 'homeWaitDirection',
};
const industries: Record<string, MessageKey> = {
  '半导体': 'industrySemiconductors',
  '存储': 'industryMemory',
  '巨头': 'industryMegacaps',
  '软件云': 'industryCloudSoftware',
  '航天': 'industryAerospace',
  '消费': 'industryConsumer',
  '能源电力': 'industryEnergy',
  '大盘 ETF': 'industryBroadEtf',
  '波动率': 'industryVolatility',
  '现金类': 'industryCash',
  '未分类': 'industryUnclassified',
};
export function marketSessionLabel(value: string, locale: Locale): string {
  return sessions[value] ? translate(locale, sessions[value]) : value;
}
export function tradeDirectionLabel(value: string, locale: Locale): string {
  return directions[value] ? translate(locale, directions[value]) : value;
}
export function industryLabel(value: string, locale: Locale): string {
  return value
    .split(' · ')
    .map((part) => (industries[part] ? translate(locale, industries[part]) : part))
    .join(' · ');
}
