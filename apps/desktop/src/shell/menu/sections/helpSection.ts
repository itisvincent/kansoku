import { desktopText } from '../../i18n.js';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActionDeps } from '../types.js';

export function buildHelpSection(deps: MenuActionDeps): MenuItemConstructorOptions {
  return {
    role: 'help',
    label: desktopText('帮助', 'Help'),
    submenu: [
      {
        label: desktopText('查看日志…', 'View logs…'),
        click: () => deps.openLogs(),
      },
      { type: 'separator' },
      {
        label: desktopText('显示 Agent Workspace…', 'Show Agent Workspace…'),
        click: () => deps.openWorkspace(),
      },
      {
        label: desktopText('导入 Kansoku 数据…', 'Import Kansoku data…'),
        click: () => deps.importFromRepo(),
      },
    ],
  };
}
