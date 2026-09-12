import { useState } from 'react';
import type { LongbridgeRegionPreference } from '@kansoku/core/contract/settings';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Badge, Button, SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { getDesktopCredentialsBridge, type CredentialsGetResult } from './desktopCredentials';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { useLocale } from '../../lib/i18n';

const INSTALL_URL = 'https://open.longbridge.com/docs/cli/install';

export function LongbridgeSection() {
  const { t } = useLocale();
  const regionOptions = [
    { value: 'auto', label: t('automatic') },
    { value: 'com', label: t('internationalSite') },
    { value: 'cn', label: t('mainlandSite') },
  ] satisfies readonly SegmentedControlOption<LongbridgeRegionPreference>[];
  const bridge = getDesktopCredentialsBridge();
  const { data, reload } = useQuery<CredentialsGetResult>(
    bridge ? 'credentials.status' : null,
    () => client.credentials.status() as Promise<CredentialsGetResult>,
  );
  const region = useQuery<{ region: LongbridgeRegionPreference }>(
    bridge ? 'settings.getLongbridgeRegion' : null,
    () => client.settings.getLongbridgeRegion(),
  );
  const [regionBusy, setRegionBusy] = useState(false);
  const [regionError, setRegionError] = useState<string | null>(null);

  if (!bridge) return null;

  const ready = data?.state === 'ready';
  const label = ready
    ? t('marketConnected')
    : data?.state === 'cli_missing'
      ? t('cliNotInstalled')
      : data?.state === 'login_required'
        ? t('loginRequired')
        : t('tokenUnreadable');

  const handleRegionChange = async (next: LongbridgeRegionPreference) => {
    setRegionBusy(true);
    setRegionError(null);
    try {
      await client.settings.putLongbridgeRegion({ region: next });
      region.reload();
    } catch (err) {
      setRegionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegionBusy(false);
    }
  };

  return (
    <SettingsGroup
      name="Longbridge CLI"
      badge={<Badge tone={ready ? 'up' : 'down'}>{label}</Badge>}
    >
      <SettingsRow
        label={t('executable')}
        mono={data?.cliPath ?? t('notFound')}
        error={data?.lastError ?? undefined}
      >
        <Button onClick={reload}>{t('redetect')}</Button>
      </SettingsRow>
      {region.data ? (
        <SettingsRow
          label={t('route')}
          description={t('routeDescription')}
          error={regionError ?? undefined}
        >
          <SegmentedControl
            ariaLabel={t('longbridgeRoute')}
            disabled={regionBusy}
            value={region.data.region}
            options={regionOptions}
            onChange={(next) => void handleRegionChange(next)}
          />
        </SettingsRow>
      ) : null}
      <SettingsRow label={t('installHint')} description={t('installHintDescription')}>
        <Button onClick={() => window.open(INSTALL_URL, '_blank', 'noopener,noreferrer')}>
          {t('installGuide')}
        </Button>
      </SettingsRow>
    </SettingsGroup>
  );
}
