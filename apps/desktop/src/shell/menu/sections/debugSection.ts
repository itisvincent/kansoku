import { desktopText } from '../../i18n.js';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActionDeps } from '../types.js';

export function buildDebugSection(deps: MenuActionDeps): MenuItemConstructorOptions | null {
  const devLicense = deps.devLicense;
  if (!devLicense) return null;
  const unlicensed = devLicense.isUnlicensed();
  return {
    label: desktopText('调试', 'Debug'),
    submenu: [
      {
        label: desktopText('许可：已激活', 'License: active'),
        type: 'radio',
        checked: !unlicensed,
        click: () => devLicense.set(false),
      },
      {
        label: desktopText('许可：未激活（模拟）', 'License: inactive (simulated)'),
        type: 'radio',
        checked: unlicensed,
        click: () => devLicense.set(true),
      },
    ],
  };
}
