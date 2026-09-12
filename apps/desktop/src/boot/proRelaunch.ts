import { desktopText } from '../shell/i18n.js';
import { BrowserWindow, app, dialog } from 'electron';

let prompted = false;

export async function promptProRelaunch(): Promise<void> {
  if (prompted) return;
  prompted = true;
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const options = {
    type: 'info' as const,
    buttons: [desktopText('立即重启', 'Restart now')],
    defaultId: 0,
    title: 'Kansoku',
    message: desktopText('AI 付费功能已解锁', 'Paid AI features are unlocked'),
    detail: desktopText(
      '需要重启应用完成加载，点击「立即重启」后应用会自动重新打开。',
      'Restart the app to finish loading. It will reopen automatically after you choose Restart now.',
    ),
  };
  await (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options));
  console.info('[desktop] bundle key landed — relaunching to load pro');
  app.relaunch();
  app.quit();
}

export async function maybePromptProRelaunchAfterKeyLanded(): Promise<void> {
  const [{ hasEncBundle, isProPresent }, { getActiveBundleKey }] = await Promise.all([
    import('@kansoku/core/pro/bundleState'),
    import('@kansoku/core/license/licenseState'),
  ]);
  if (!hasEncBundle() || isProPresent() || !getActiveBundleKey()) return;
  await promptProRelaunch();
}

export function resetProRelaunchForTests(): void {
  prompted = false;
}
