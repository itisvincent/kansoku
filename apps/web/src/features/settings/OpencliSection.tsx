import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Badge, Button } from '@web/ui';
import { getDesktopCredentialsBridge, type OpencliStatus } from './desktopCredentials';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { useLocale } from '../../lib/i18n';

const INSTALL_COMMAND = 'npm install -g @jackwener/opencli';
const GITHUB_URL = 'https://github.com/jackwener/opencli';
const RELEASES_URL = 'https://github.com/jackwener/opencli/releases';

export function OpencliSection() {
  const { t } = useLocale();
  const bridge = getDesktopCredentialsBridge();
  const { data, reload } = useQuery<OpencliStatus>(
    bridge ? 'credentials.opencliStatus' : null,
    () => client.credentials.opencliStatus() as Promise<OpencliStatus>,
  );

  if (!bridge) return null;

  const state = data?.state;
  const ready = state === 'ready';

  return (
    <SettingsGroup
      name="X/Twitter (opencli)"
      badge={
        <Badge tone={ready ? 'up' : 'down'}>
          {state
            ? (
                {
                  ready: t('connected'),
                  not_installed: t('notInstalledCli'),
                  extension_missing: t('extensionMissing'),
                  no_session: t('noSession'),
                } as const
              )[state]
            : t('checking')}
        </Badge>
      }
    >
      <SettingsRow
        label={t('executable')}
        description={t('opencliDescription')}
        mono={data?.cliPath ?? t('notFound')}
        error={ready ? undefined : (data?.lastError ?? undefined)}
      >
        <Button onClick={reload}>{t('redetect')}</Button>
      </SettingsRow>
      {state === 'not_installed' ? (
        <SettingsRow label={t('installCli')} mono={INSTALL_COMMAND}>
          <Button onClick={() => void navigator.clipboard.writeText(INSTALL_COMMAND)}>
            {t('copyCommand')}
          </Button>
          <Button onClick={() => window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')}>
            GitHub
          </Button>
        </SettingsRow>
      ) : null}
      {state === 'extension_missing' ? (
        <SettingsRow label={t('installExtension')} description={t('opencliExtensionSteps')}>
          <Button onClick={() => window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')}>
            {t('downloadExtension')}
          </Button>
        </SettingsRow>
      ) : null}
      {state === 'no_session' ? (
        <SettingsRow label={t('loginX')} description={t('opencliSessionSteps')} />
      ) : null}
    </SettingsGroup>
  );
}
