import { desktopText } from '../../i18n.js';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuActionDeps } from '../types.js';

export function buildGoSection(deps: MenuActionDeps): MenuItemConstructorOptions {
  return {
    label: desktopText('前往', 'Go'),
    submenu: [
      {
        label: desktopText('AI 对话', 'AI Chat'),
        accelerator: 'CmdOrCtrl+L',
        click: () => deps.openChat(),
      },
      {
        label: desktopText('研究库', 'Research library'),
        accelerator: 'CmdOrCtrl+Shift+L',
        click: () => deps.openResearch(),
      },
      { type: 'separator' },
      {
        label: desktopText('盲盘训练', 'Blind training'),
        accelerator: 'CmdOrCtrl+Shift+B',
        click: () => deps.openTrainer(),
      },
    ],
  };
}
