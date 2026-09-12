import { desktopText } from '../../i18n.js';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActionDeps } from '../types.js';

export function buildWindowSection(deps: MenuActionDeps): MenuItemConstructorOptions {
  return {
    label: desktopText('窗口', 'Window'),
    submenu: [
      {
        label: desktopText('新建窗口', 'New window'),
        accelerator: 'CmdOrCtrl+N',
        click: () => deps.newWindow(),
      },
      {
        label: desktopText('新建标签页', 'New tab'),
        accelerator: 'CmdOrCtrl+T',
        click: () => deps.newTab(),
      },
      {
        label: desktopText('关闭标签页', 'Close tab'),
        accelerator: 'CmdOrCtrl+W',
        click: () => deps.closeTab(),
      },
      { type: 'separator' },
      {
        label: desktopText('下一个标签页', 'Next tab'),
        accelerator: 'CmdOrCtrl+Shift+]',
        click: () => deps.nextTab(),
      },
      {
        label: desktopText('上一个标签页', 'Previous tab'),
        accelerator: 'CmdOrCtrl+Shift+[',
        click: () => deps.prevTab(),
      },
      { type: 'separator' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
    ],
  };
}
