import { useCallback, useEffect, useState } from 'react';
import { Button, openModal } from '@web/ui';
import { getDesktopLogsBridge } from '../logs/desktopLogs';
import { LogsViewer } from '../logs/LogsPage';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { useLocale } from '../../lib/i18n';

export function DiagnosticsSection() {
  const { t } = useLocale();
  const [bridge] = useState(() => getDesktopLogsBridge());
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      const info = await bridge.getInfo();
      setPath(info.path);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!bridge) return null;

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.reveal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openLogs = () =>
    openModal({
      title: t('diagnostics'),
      size: 'lg',
      body: <LogsViewer />,
    });

  return (
    <SettingsGroup name={t('diagnostics')}>
      <SettingsRow label={t('logDirectory')} mono={path ?? t('loading')} error={error ?? undefined}>
        <Button type="button" disabled={busy} onClick={openLogs}>
          {t('viewLogs')}
        </Button>
        <Button type="button" disabled={busy} onClick={() => void reveal()}>
          {t('showInExplorer')}
        </Button>
      </SettingsRow>
    </SettingsGroup>
  );
}
