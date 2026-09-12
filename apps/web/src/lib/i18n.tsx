import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'zh-CN' | 'en-US';

const STORAGE_KEY = 'kansoku.locale';

const messages = {
  'zh-CN': {
    settings: '设置', back: '返回', about: '关于 Kansoku',
    aiModels: 'AI 模型', aiModelsDescription: '角色分配、Provider 凭据与今日用量',
    display: '显示', displayDescription: '时间口径与关注的市场',
    connections: '连接', connectionsDescription: '行情来源、本地工作区与同步',
    license: '订阅与授权', licenseDescription: '当前方案、设备与付费功能',
    advanced: '高级', advancedDescription: '技能模板、离线训练与诊断',
    language: '语言', languageDescription: '选择界面语言', chinese: '简体中文', english: 'English',
  },
  'en-US': {
    settings: 'Settings', back: 'Back', about: 'About Kansoku',
    aiModels: 'AI Models', aiModelsDescription: 'Role assignments, provider credentials, and today’s usage',
    display: 'Display', displayDescription: 'Time conventions and watched markets',
    connections: 'Connections', connectionsDescription: 'Market data, workspace, and synchronization',
    license: 'Subscription & License', licenseDescription: 'Current plan, device, and paid features',
    advanced: 'Advanced', advancedDescription: 'Skill templates, offline training, and diagnostics',
    language: 'Language', languageDescription: 'Choose the interface language', chinese: '简体中文', english: 'English',
  },
} as const;

type MessageKey = keyof typeof messages['en-US'];
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: MessageKey) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);

function readLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';
  return window.localStorage.getItem(STORAGE_KEY) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (key: MessageKey) => messages[locale][key] }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider');
  return value;
}
