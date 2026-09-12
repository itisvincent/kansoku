import { useCallback, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, openModal, Switch } from '@web/ui';
import { AgentKitConflictDialog } from './AgentKitConflictDialog';
import { AgentKitUpdateDialog } from './AgentKitUpdateDialog';
import { SettingsField, SettingsGroup, SettingsRow } from './SettingsGroup';
import { openSettingsConfirm } from './openSettingsConfirm';
import { useLocale } from '../../lib/i18n';
import {
  getDesktopAgentKitBridge,
  type AgentKitStatus,
  type PendingConflict,
  type PendingUpdate,
} from './desktopAgentKit';

const styles = stylex.create({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  spacer: {
    flex: 1,
  },
});

function locationLabel(status: AgentKitStatus): string {
  if (status.location.kind === 'custom') return status.location.path;
  return `Agent Workspace · ${status.dataRoot}`;
}

export function AgentKitSection() {
  const { t } = useLocale();
  const [bridge] = useState(() => getDesktopAgentKitBridge());
  const [status, setStatus] = useState<AgentKitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.getStatus();
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!bridge) return null;

  const withBusy = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (enabled: boolean) => void withBusy(() => bridge.setEnabled({ enabled }));
  const follow = () => void withBusy(() => bridge.followDataRoot());
  const pick = () => void withBusy(() => bridge.pickCustomLocation());
  const forceSync = () => void withBusy(() => bridge.forceSync());
  const clean = () =>
    openSettingsConfirm({
      title: t('agentKitClean'),
      message: t('agentKitCleanDescription'),
      confirmLabel: t('confirmClean'),
      danger: true,
      onConfirm: () => void withBusy(() => bridge.clean()),
    });

  const openConflict = (conflict: PendingConflict) =>
    openModal({
      title: (
        <>
          {t('resolveConflict')} · {conflict.dest}
        </>
      ),
      size: 'sm',
      body: (close) => (
        <AgentKitConflictDialog
          conflict={conflict}
          bridge={bridge}
          onResolved={reload}
          close={close}
        />
      ),
    });

  const openUpdate = (update: PendingUpdate) =>
    openModal({
      title: (
        <>
          {t('templateAvailable')} · {update.dest}
        </>
      ),
      size: 'sm',
      body: (close) => (
        <AgentKitUpdateDialog update={update} bridge={bridge} onResolved={reload} close={close} />
      ),
    });

  const canSync = Boolean(status?.enabled && status?.resolvedPath);

  return (
    <SettingsGroup name="Agent Kit">
      <SettingsRow
        label={t('enabled')}
        description={t('agentKitDescription')}
        error={error ?? undefined}
      >
        <Switch
          ariaLabel={t('agentKitEnable')}
          checked={status?.enabled ?? false}
          disabled={busy || !status}
          onCheckedChange={(checked) => toggle(checked)}
        />
      </SettingsRow>
      <SettingsRow
        label={t('integrationLocation')}
        mono={
          status
            ? `${locationLabel(status)}${status.resolvedPath === null ? t('notActive') : ''}`
            : t('loading')
        }
      />
      {status ? (
        <SettingsRow
          label={t('templateVersion')}
          mono={`${status.kitVersion ?? '—'} · ${t('lastSync', { time: status.lastSyncAt ?? '—' })}`}
        />
      ) : null}
      {status?.pendingConflicts?.map((conflict) => (
        <SettingsRow key={conflict.dest} label={t('pendingConflict')} mono={conflict.dest}>
          <Button onClick={() => openConflict(conflict)}>{t('handle')}</Button>
        </SettingsRow>
      ))}
      {status?.pendingUpdates?.map((update) => (
        <SettingsRow key={update.dest} label={t('templateAvailable')} mono={update.dest}>
          <Button onClick={() => openUpdate(update)}>{t('view')}</Button>
        </SettingsRow>
      ))}
      <SettingsField label={t('actions')}>
        <div {...stylex.props(styles.actions)}>
          <Button disabled={busy || status?.location.kind === 'follow-data-root'} onClick={follow}>
            {t('useWorkspace')}
          </Button>
          <Button disabled={busy} onClick={pick}>
            {t('connectProject')}
          </Button>
          <span {...stylex.props(styles.spacer)} />
          <Button disabled={busy || !canSync} onClick={forceSync}>
            {t('refresh')}
          </Button>
          <Button disabled={busy} onClick={clean}>
            {t('clean')}
          </Button>
        </div>
      </SettingsField>
    </SettingsGroup>
  );
}
