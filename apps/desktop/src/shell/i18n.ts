import { getInterfaceLocale } from '@kansoku/core/settings/interfaceLocale';

export function desktopText(chinese: string, english: string): string {
  return getInterfaceLocale() === 'zh-CN' ? chinese : english;
}
