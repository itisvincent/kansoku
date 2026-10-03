import { describe, expect, it } from 'vitest';
import { TITLEBAR_HEIGHT, windowFrameOptions } from '@desktop/shell/window/frame.js';

describe('windowFrameOptions', () => {
  it('keeps the inset traffic lights on macOS', () => {
    expect(windowFrameOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
    });
  });

  it('draws the app’s own dark title bar on Windows, with Windows’ buttons over it', () => {
    expect(windowFrameOptions('win32')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#141414', symbolColor: '#9a9a9a', height: TITLEBAR_HEIGHT },
    });
    expect(TITLEBAR_HEIGHT).toBe(40);
  });

  it('does the same on Linux', () => {
    expect(windowFrameOptions('linux')).toMatchObject({ titleBarStyle: 'hidden' });
  });
});
