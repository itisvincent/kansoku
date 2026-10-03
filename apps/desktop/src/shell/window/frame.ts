import type { BrowserWindowConstructorOptions } from 'electron';

/** Height of the app's own title bar (the tab strip). */
export const TITLEBAR_HEIGHT = 40;
// The app is dark only; these match the web theme's backgroundSurface and textSecondary.
const TITLEBAR_BG = '#141414';
const TITLEBAR_SYMBOL = '#9a9a9a';

type FrameOptions = Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'trafficLightPosition' | 'titleBarOverlay'
>;

/**
 * Every window draws its own title bar. macOS insets the traffic lights into it; Windows and
 * Linux hide the native frame and menu bar and draw their minimise / maximise / close buttons
 * over the app's bar (the page leaves room for them via the titlebar-area CSS variables).
 */
export function windowFrameOptions(platform: NodeJS.Platform = process.platform): FrameOptions {
  if (platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } };
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: TITLEBAR_BG, symbolColor: TITLEBAR_SYMBOL, height: TITLEBAR_HEIGHT },
  };
}
