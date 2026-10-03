import { readThemeMode } from './themeMode';

const dark = {
  bgCanvas: '#0a0a0a',
  bgSurface: '#141414',
  bgElement: '#1e1e1e',
  border: '#262626',
  gridLine: '#1d1d1d',
  borderStrong: '#3a3a3a',
  textPrimary: '#e8e8e8',
  textSecondary: '#9a9a9a',
  textMuted: '#5c5c5c',
  accent: '#facc15',
  up: '#26a69a',
  down: '#ef5350',
  /** Behind text drawn on the chart (drawing labels, FVG tags). */
  labelBg: 'rgba(10, 10, 10, 0.85)',
  /** Pre/post-market shading, and its legend swatch. */
  sessionShade: 'rgba(232, 232, 232, 0.08)',
  sessionSwatch: 'rgba(232, 232, 232, 0.3)',
  overnightShade: 'rgba(70, 100, 180, 0.22)',
  /** Dashed guide lines (RSI 70/30, and the fainter midline). */
  guideLine: 'rgba(232, 232, 232, 0.28)',
  guideLineFaint: 'rgba(232, 232, 232, 0.16)',
  /** Trainer replay bands: the given history and the hidden future. */
  bandGiven: 'rgba(232, 232, 232, 0.045)',
  bandFog: 'rgba(232, 232, 232, 0.10)',
  fontMono: "ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

const light: { [K in keyof typeof dark]: string } = {
  bgCanvas: '#ffffff',
  bgSurface: '#ffffff',
  bgElement: '#f1f1f3',
  border: '#e2e2e5',
  gridLine: '#f0f0f2',
  borderStrong: '#cbcbd0',
  textPrimary: '#18181b',
  textSecondary: '#5b5b63',
  textMuted: '#93939b',
  accent: '#c98a00',
  up: '#26a69a',
  down: '#ef5350',
  labelBg: 'rgba(255, 255, 255, 0.92)',
  sessionShade: 'rgba(24, 24, 27, 0.045)',
  sessionSwatch: 'rgba(24, 24, 27, 0.18)',
  overnightShade: 'rgba(70, 100, 180, 0.10)',
  guideLine: 'rgba(24, 24, 27, 0.28)',
  guideLineFaint: 'rgba(24, 24, 27, 0.14)',
  bandGiven: 'rgba(24, 24, 27, 0.03)',
  bandFog: 'rgba(24, 24, 27, 0.06)',
  fontMono: dark.fontMono,
};

/**
 * Chart and canvas colors for the theme this window loaded with. Charts read these when they
 * are drawn; switching the theme reloads the window (lib/themeMode).
 */
export const theme: { readonly [K in keyof typeof dark]: string } =
  readThemeMode() === 'light' ? light : dark;

export const seriesPalette = [
  theme.accent,
  theme.textPrimary,
  theme.up,
  theme.down,
  theme.textSecondary,
] as const;
