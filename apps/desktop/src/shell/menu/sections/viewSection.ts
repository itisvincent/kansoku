import { desktopText } from '../../i18n.js';
import type { MenuItemConstructorOptions } from 'electron';

export function buildViewSection(): MenuItemConstructorOptions {
  return {
    label: desktopText('显示', 'View'),
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };
}
