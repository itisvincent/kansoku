import * as stylex from '@stylexjs/stylex';
import { colors } from './tokens.stylex';

/**
 * The light palette. Applied as a class on <html> (see lib/themeMode), it overrides every
 * color variable at once. Up/down/accent are a shade darker than in the dark palette so they
 * stay readable as text on white.
 */
export const lightTheme = stylex.createTheme(colors, {
  backgroundCanvas: '#f4f4f5',
  backgroundDeep: '#e9e9eb',
  backgroundSurface: '#ffffff',
  backgroundElement: '#f1f1f3',
  backgroundHover: '#e7e7ea',
  backgroundBackdrop: 'rgba(0, 0, 0, 0.32)',
  backgroundSunken: 'rgba(0, 0, 0, 0.04)',
  border: '#e2e2e5',
  borderStrong: '#cbcbd0',
  textBright: '#000',
  textOnColor: '#fff',
  textPrimary: '#18181b',
  textSecondary: '#5b5b63',
  textMuted: '#93939b',
  accent: '#b46c00',
  focusBorder: '#8a8a92',
  focusRing: '0 0 0 2px rgb(24 24 27 / 0.12)',
  focusOutline: '1px solid rgb(24 24 27 / 0.35)',
  up: '#0f8a7e',
  down: '#d6342f',
  ok: '#1f9d45',
});
