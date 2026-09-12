import { desktopText } from '../../shell/i18n.js';
import type { BrowserWindow } from 'electron';
import { app, dialog } from 'electron';
import type { ChartIndexRefreshResult } from '@kansoku/core/charts/store';
import { dataRoot } from '../../boot/env.js';
import { importUserContent, validateImportSource } from './manifest.js';

function messageBox(
  win: BrowserWindow | null,
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function openDialog(
  win: BrowserWindow | null,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

async function runImportFromRepoFlowUnsafe(win: BrowserWindow | null): Promise<void> {
  if (!app.isPackaged) {
    await messageBox(win, {
      type: 'info',
      title: desktopText('导入 Kansoku 数据', 'Import Kansoku data'),
      message: desktopText(
        '开发模式下 Agent Workspace 本身就是仓库，无需导入。',
        'In development mode, the repository is already the Agent Workspace. No import is needed.',
      ),
    });
    return;
  }

  const picked = await openDialog(win, {
    title: desktopText(
      '选择旧的 Kansoku 数据目录或 trade 仓库',
      'Choose a previous Kansoku data folder or trade repository',
    ),
    properties: ['openDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return;
  const sourceRoot = picked.filePaths[0];

  const validation = validateImportSource(sourceRoot, dataRoot);
  if (!validation.ok) {
    const messages: Record<typeof validation.reason, string> = {
      'self': desktopText(
        '所选目录就是当前 Agent Workspace，无需导入。',
        'This folder is already the current Agent Workspace. No import is needed.',
      ),
      'missing-content': desktopText(
        '所选目录里找不到 journal/ 或 stocks/。',
        'The selected folder does not contain journal/ or stocks/.',
      ),
      'empty': desktopText(
        '所选目录里没有可导入的用户文件。',
        'The selected folder has no user files to import.',
      ),
    };
    await messageBox(win, {
      type: 'warning',
      title: desktopText('导入 Kansoku 数据', 'Import Kansoku data'),
      message: messages[validation.reason],
    });
    return;
  }

  const result = await importUserContent(sourceRoot, dataRoot);
  let indexResult: ChartIndexRefreshResult | null = null;
  let indexError: string | null = null;
  try {
    const { refreshChartIndex } = await import('@kansoku/core/charts/store');
    indexResult = await refreshChartIndex();
  } catch (error) {
    indexError = error instanceof Error ? error.message : String(error);
  }

  const summaryLines = [
    desktopText(
      `导入完成：复制 ${result.copied} 个文件，内容相同 ${result.identical} 个。`,
      `Import complete: ${result.copied} files copied; ${result.identical} already identical.`,
    ),
  ];
  if (result.conflicts.length > 0) {
    summaryLines.push(
      desktopText(
        `保留 ${result.conflicts.length} 个同名冲突副本，没有覆盖现有文件。`,
        `${result.conflicts.length} conflicting copies preserved; existing files were kept.`,
      ),
    );
  }
  if (result.skippedSymlinks.length > 0) {
    summaryLines.push(
      desktopText(
        `跳过 ${result.skippedSymlinks.length} 个符号链接。`,
        `${result.skippedSymlinks.length} symbolic links skipped.`,
      ),
    );
  }
  if (indexResult) {
    summaryLines.push(
      desktopText(
        `图表索引已同步：识别 ${indexResult.indexed} 个，忽略 ${indexResult.skipped} 个。`,
        `Chart index updated: ${indexResult.indexed} indexed, ${indexResult.skipped} skipped.`,
      ),
    );
    if (indexResult.failures.length > 0) {
      summaryLines.push(
        ...indexResult.failures.slice(0, 5).map((failure) => `- ${failure.file}: ${failure.error}`),
      );
      if (indexResult.failures.length > 5) {
        summaryLines.push(
          desktopText(
            `- 另有 ${indexResult.failures.length - 5} 个文件未进入索引。`,
            `- ${indexResult.failures.length - 5} more files were not indexed.`,
          ),
        );
      }
    }
  } else if (indexError) {
    summaryLines.push(
      desktopText(
        `文件已经复制，但图表索引同步失败：${indexError}`,
        `Files were copied, but the chart index could not be updated: ${indexError}`,
      ),
    );
  }
  if (result.failed.length > 0) {
    summaryLines.push(
      desktopText(
        `有 ${result.failed.length} 个文件复制失败：`,
        `${result.failed.length} files could not be copied:`,
      ),
    );
    summaryLines.push(...result.failed.map((failure) => `- ${failure.path}: ${failure.error}`));
  }
  await messageBox(win, {
    type:
      result.failed.length > 0 ||
      result.conflicts.length > 0 ||
      result.skippedSymlinks.length > 0 ||
      indexError ||
      (indexResult?.skipped ?? 0) > 0
        ? 'warning'
        : 'info',
    title: desktopText('导入 Kansoku 数据', 'Import Kansoku data'),
    message: summaryLines.join('\n'),
  });
}

// Validation can throw on unreadable dirs or a source deleted mid-flow; this
// guard keeps the menu click promise from rejecting unhandled.
export async function runImportFromRepoFlow(win: BrowserWindow | null): Promise<void> {
  try {
    await runImportFromRepoFlowUnsafe(win);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[desktop] import-from-repo failed', error);
    await messageBox(win, {
      type: 'error',
      title: desktopText('导入 Kansoku 数据', 'Import Kansoku data'),
      message: desktopText(`导入失败：${message}`, `Import failed: ${message}`),
    });
  }
}
