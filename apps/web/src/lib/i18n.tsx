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
    checking: '检测中', connected: '已连接', notInstalledCli: '未安装 CLI', extensionMissing: '缺少浏览器扩展', noSession: '需要登录 x.com', executable: '可执行文件', opencliDescription: 'AI 分析时用它抓推特上的消息面', redetect: '重新检测', installCli: '安装 CLI', copyCommand: '复制命令', installExtension: '装浏览器扩展', downloadExtension: '下载扩展', loginX: '登录 x.com',
    providerCredentials: 'Provider 与凭据', keysCount: '个 key', codexLoggedIn: 'Codex 已登录', codexNotLoggedIn: 'Codex 未登录', codexLoginError: 'Codex 登录异常', lobeConnected: 'LobeHub 已连接', lobePending: 'LobeHub 待启用', lobeNotConnected: 'LobeHub 未连接', masterKeyError: '主密钥异常，已存的凭据无法解密', resetCredentials: '重置全部凭据', addProvider: '添加 Provider', saving: '保存中…', apiKey: 'API key', connectData: '连接数据', configureAi: '配置 AI', connectX: '连接 X', checkingOpencli: '正在检测 opencli 环境…', twitterExplainer: 'AI 分析时会抓取推特上的市场消息；可以先跳过，之后随时在设置里配置。', finish: '完成', skipConfigureLater: '跳过，稍后在设置里配置', aiChecking: '正在检测本机 AI 环境…', aiExplainer: 'AI 用于盘中快评、升级分析、深度研究和追问。可以先跳过，之后随时在设置里配置。', use: '使用', install: '去安装', login: '登录', fillIn: '填入', recommended: '推荐', configuring: '配置中…', starting: '启动中…', saveAndUse: '保存并使用', installDocs: '安装文档',
  },
  'en-US': {
    settings: 'Settings', back: 'Back', about: 'About Kansoku',
    aiModels: 'AI Models', aiModelsDescription: 'Role assignments, provider credentials, and today’s usage',
    display: 'Display', displayDescription: 'Time conventions and watched markets',
    connections: 'Connections', connectionsDescription: 'Market data, workspace, and synchronization',
    license: 'Subscription & License', licenseDescription: 'Current plan, device, and paid features',
    advanced: 'Advanced', advancedDescription: 'Skill templates, offline training, and diagnostics',
    language: 'Language', languageDescription: 'Choose the interface language', chinese: '简体中文', english: 'English',
    checking: 'Checking', connected: 'Connected', notInstalledCli: 'CLI not installed', extensionMissing: 'Browser extension missing', noSession: 'Sign in to x.com', executable: 'Executable', opencliDescription: 'Fetches X/Twitter market context for AI analysis', redetect: 'Check again', installCli: 'Install CLI', copyCommand: 'Copy command', installExtension: 'Install browser extension', downloadExtension: 'Download extension', loginX: 'Sign in to x.com',
    providerCredentials: 'Providers & credentials', keysCount: 'keys', codexLoggedIn: 'Codex signed in', codexNotLoggedIn: 'Codex not signed in', codexLoginError: 'Codex sign-in error', lobeConnected: 'LobeHub connected', lobePending: 'LobeHub pending', lobeNotConnected: 'LobeHub not connected', masterKeyError: 'The master key is invalid; saved credentials cannot be decrypted', resetCredentials: 'Reset all credentials', addProvider: 'Add provider', saving: 'Saving…', apiKey: 'API key', connectData: 'Connect data', configureAi: 'Configure AI', connectX: 'Connect X', checkingOpencli: 'Checking opencli…', twitterExplainer: 'AI analysis can use market context from X/Twitter. You can skip this and configure it later in Settings.', finish: 'Finish', skipConfigureLater: 'Skip and configure later in Settings', aiChecking: 'Checking the local AI environment…', aiExplainer: 'AI powers intraday reviews, upgraded analysis, deep research, and follow-up questions. You can skip this and configure it later in Settings.', use: 'Use', install: 'Install', login: 'Sign in', fillIn: 'Enter key', recommended: 'Recommended', configuring: 'Configuring…', starting: 'Starting…', saveAndUse: 'Save and use', installDocs: 'Installation guide',
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
  if (value) return value;
  // Keep isolated page/unit renders working (several route and component tests
  // intentionally render a settings pane without bootstrapping the app shell).
  const locale: Locale = 'zh-CN';
  return { locale, setLocale: () => {}, t: (key: MessageKey) => messages[locale][key] };
}


