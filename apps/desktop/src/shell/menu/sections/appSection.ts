import { desktopText } from '../../i18n.js';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActionDeps } from '../types.js';

export function buildAppSectionWithName(
  appName: string,
  deps: MenuActionDeps,
): MenuItemConstructorOptions {
  return {
    label: appName,
    submenu: [
      {
        label: desktopText(`关于 ${appName}`, `About ${appName}`),
        click: () => deps.openAbout(),
      },
      { type: 'separator' },
      deps.updateAvailable()
        ? {
            label: desktopText('重启以更新…', 'Restart to update…'),
            click: () => deps.installUpdate(),
          }
        : {
            label: desktopText('检查更新…', 'Check for updates…'),
            click: () => deps.checkForUpdates(),
          },
      { type: 'separator' },
      {
        label: desktopText('设置…', 'Settings…'),
        accelerator: 'CmdOrCtrl+,',
        click: () => deps.openSettings(),
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };
}
