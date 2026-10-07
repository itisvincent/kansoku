const fonts = {
  fontMono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  fontUi: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif",
  radius: 2,
} as const;

const dark = {
  bgCanvas: '#0a0a0a',
  bgSurface: '#141414',
  bgElement: '#1e1e1e',
  bgHover: '#262626',
  border: '#262626',
  gridLine: '#1d1d1d',
  borderStrong: '#3a3a3a',
  textPrimary: '#e8e8e8',
  textSecondary: '#9a9a9a',
  textMuted: '#5c5c5c',
  accent: '#ffb000',
  up: '#26a69a',
  down: '#ef5350',
  /** Pre/post-market and overnight shading on candle charts. */
  sessionShade: 'rgba(232, 232, 232, 0.08)',
  overnightShade: 'rgba(70, 100, 180, 0.22)',
  focusRing: 'rgb(232 232 232 / 0.12)',
  focusBorder: '#7a7a7a',
  shadow: 'rgb(0 0 0 / 0.35)',
};

// Matches the app's light palette: cards are white on a light grey page, and the up / down /
// accent colors are a shade darker so they stay readable as text on white.
const light: typeof dark = {
  bgCanvas: '#f4f4f5',
  bgSurface: '#ffffff',
  bgElement: '#f1f1f3',
  bgHover: '#e7e7ea',
  border: '#e2e2e5',
  gridLine: '#f0f0f2',
  borderStrong: '#cbcbd0',
  textPrimary: '#18181b',
  textSecondary: '#5b5b63',
  textMuted: '#93939b',
  accent: '#b46c00',
  up: '#0f8a7e',
  down: '#d6342f',
  sessionShade: 'rgba(24, 24, 27, 0.045)',
  overnightShade: 'rgba(70, 100, 180, 0.10)',
  focusRing: 'rgb(24 24 27 / 0.12)',
  focusBorder: '#8a8a92',
  shadow: 'rgb(0 0 0 / 0.12)',
};

/**
 * The app's theme, read once when the canvas loads: the page that shows a canvas marks
 * <html data-theme="light"> before any of it runs, and switching the theme reloads it.
 */
function isLight(): boolean {
  return globalThis.document?.documentElement?.dataset?.theme === 'light';
}

export const theme = { ...(isLight() ? light : dark), ...fonts };

export const type = {
  title: 16,
  section: 13,
  body: 13,
  caption: 12,
  small: 11,
  stat: 22,
  lineHeight: 1.6,
} as const;

// 组件只管内边距；外边距归零，兄弟间距由父级 gap 决定。
export const space = {
  flow: 16,
  section: 12,
  grid: 10,
  cardY: 10,
  cardX: 12,
  cellY: 7,
  cellX: 12,
} as const;

export const seriesPalette = [
  theme.accent,
  theme.textPrimary,
  theme.up,
  theme.down,
  theme.textSecondary,
] as const;
