import { desktopText } from '../../i18n.js';
import type { MenuItemConstructorOptions } from 'electron';

export function buildEditSection(): MenuItemConstructorOptions {
  return {
    label: desktopText('编辑', 'Edit'),
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: desktopText('朗读', 'Speech'),
        submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
      },
    ],
  };
}
