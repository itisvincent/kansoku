import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '@web/ui';
import { getDesktopWorkspaceBridge, type WorkspaceStatus } from './desktopWorkspace';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { openSettingsConfirm } from './openSettingsConfirm';
import { useLocale } from '../../lib/i18n';

const MODE_LABEL: Record<WorkspaceStatus['mode'], string> = {
  'local': 'workspaceLocal',
  'dev-repo': 'workspaceDev',
  'iCloud': 'iCloud',
};

export function WorkspaceSection() {
  const { t } = useLocale();
  const [bridge] = useState(() => getDesktopWorkspaceBridge());
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      setStatus(await bridge.get());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [bridge]);

  useEffect(() => void reload(), [reload]);
  if (!bridge) return null;

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const restoreLocal = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.restoreLocal();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  const confirmRestoreLocal = () =>
    openSettingsConfirm({
      title: t('restoreLocal'),
      message: t('restoreConfirmMessage'),
      confirmLabel: t('confirmRestore'),
      onConfirm: () => void restoreLocal(),
    });

  return (
    <SettingsGroup
      name={t('agentWorkspace')}
      badge={
        status ? (
          <Badge tone={status.mode === 'iCloud' ? 'accent' : undefined}>
            {t(MODE_LABEL[status.mode] as 'workspaceLocal' | 'workspaceDev' | 'iCloud')}
          </Badge>
        ) : null
      }
    >
      <SettingsRow
        label={t('directory')}
        mono={status?.path ?? t('loading')}
        error={error ?? undefined}
      >
        <Button disabled={busy || !status} onClick={() => void open()}>
          {t('showInExplorer')}
        </Button>
      </SettingsRow>
      <SettingsRow label={t('contents')} description={t('workspaceDescription')} />
      {status?.mode === 'iCloud' ? (
        <SettingsRow label={t('restoreLocal')} description={t('restoreDescription')}>
          <Button disabled={busy} onClick={confirmRestoreLocal}>
            {t('restore')}
          </Button>
        </SettingsRow>
      ) : null}
    </SettingsGroup>
  );
}
