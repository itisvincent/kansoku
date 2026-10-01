import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FutuAccountOut } from '@kansoku/core/contract/settings';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { useLocale } from '@web/lib/i18n';
import { Button, Switch } from '@web/ui';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

const QUERY_KEY = 'settings.getFutu';

/**
 * Read-only link to the user's Futu account through OpenD, Futu's own gateway running on
 * this computer. Kansoku reads positions, account totals and (optionally) the watchlist;
 * it never places orders.
 */
export function FutuSection() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  // The status is a live probe of OpenD; a remembered one from last week would mislead.
  const { data, reload, loading } = useQuery<FutuAccountOut>(
    QUERY_KEY,
    () => client.settings.getFutu(),
    { persist: false },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: { enabled?: boolean; watchlist?: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      const next = await client.settings.putFutu(patch);
      queryClient.setQueryData([QUERY_KEY], next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const status = data?.status;
  const statusText = !status
    ? loading
      ? t('futuChecking')
      : null
    : status.state === 'connected'
      ? t('futuConnected', { value1: String(status.accounts), value2: String(status.positions) })
      : status.state === 'unreachable'
        ? t('futuUnreachable')
        : status.state === 'error'
          ? t('futuError', { value1: status.message ?? '' })
          : null;

  return (
    <SettingsGroup name={t('futuAccount')}>
      <SettingsRow label={t('futuReadAccount')} description={t('futuDescription')} error={error}>
        <Switch
          ariaLabel={t('futuReadAccount')}
          checked={data?.settings.enabled ?? false}
          disabled={saving || !data}
          onCheckedChange={(checked) => void save({ enabled: checked })}
        />
      </SettingsRow>
      {data?.settings.enabled && (
        <>
          <SettingsRow
            label={t('futuAddWatchlist')}
            description={
              status?.watchlist != null
                ? t('futuWatchlistCount', { value1: String(status.watchlist) })
                : t('futuWatchlistDescription')
            }
          >
            <Switch
              ariaLabel={t('futuAddWatchlist')}
              checked={data.settings.watchlist}
              disabled={saving}
              onCheckedChange={(checked) => void save({ watchlist: checked })}
            />
          </SettingsRow>
          <SettingsRow
            label={t('futuStatus')}
            description={statusText}
            mono={`${data.settings.host}:${data.settings.port}`}
          >
            <Button size="sm" disabled={loading} onClick={() => reload()}>
              {t('futuCheckAgain')}
            </Button>
          </SettingsRow>
        </>
      )}
    </SettingsGroup>
  );
}
