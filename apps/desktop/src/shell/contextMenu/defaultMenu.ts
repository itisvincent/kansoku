import { desktopText } from '../i18n.js';

type ContextMenuParams = {
  isEditable: boolean;
  selectionText: string;
  mediaType: string;
  linkURL: string;
};

export function shouldShowDefaultMenu(_event: unknown, params: ContextMenuParams): boolean {
  if (params.isEditable) return true;
  if (params.selectionText.trim().length > 0) return true;
  if (params.mediaType === 'image' || params.mediaType === 'video') return true;
  if (params.linkURL) return true;
  return false;
}

export async function installDefaultContextMenu(): Promise<() => void> {
  const { default: contextMenu } = await import('electron-context-menu');
  const isDev = process.env.ELECTRON_DEV === '1';

  return contextMenu({
    showSearchWithGoogle: false,
    showLookUpSelection: true,
    showLearnSpelling: true,
    showCopyImage: true,
    showCopyLink: true,
    showInspectElement: isDev,
    shouldShowMenu: shouldShowDefaultMenu,
    get labels() {
      return {
        cut: desktopText('剪切', 'Cut'),
        copy: desktopText('复制', 'Copy'),
        paste: desktopText('粘贴', 'Paste'),
        selectAll: desktopText('全选', 'Select all'),
        copyLink: desktopText('复制链接', 'Copy link'),
        copyImage: desktopText('复制图片', 'Copy image'),
        copyImageAddress: desktopText('复制图片地址', 'Copy image address'),
        saveImage: desktopText('保存图片', 'Save image'),
        saveImageAs: desktopText('图片存储为…', 'Save image as…'),
        lookUpSelection: desktopText('查询“{selection}”', 'Look up “{selection}”'),
        learnSpelling: desktopText('学习拼写“{selection}”', 'Learn spelling “{selection}”'),
        inspect: desktopText('检查元素', 'Inspect element'),
        services: desktopText('服务', 'Services'),
      };
    },
  });
}
