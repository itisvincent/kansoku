import { useState } from 'react';
import type { WebSearchStatus } from '@kansoku/core/contract/settings';
import { WEB_SEARCH_PROVIDERS } from '@kansoku/core/contract/webSearch';
import { errorMessage } from '@web/lib/api';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { isDesktopRealtime } from '@web/lib/portTransport';
import { Badge, Button, Input, Switch } from '@web/ui';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { useLocale, type MessageKey } from '../../lib/i18n';

const CODEX_ROW = 'codex';
const providerNotes: Record<string, MessageKey> = {
  tavily: 'tavilySearchNote',
  exa: 'exaSearchNote',
  brave: 'braveSearchNote',
};

export function WebSearchSection() {
  const { t } = useLocale();
  const { data, reload } = useQuery<WebSearchStatus>(
    isDesktopRealtime() ? 'settings.getWebSearch' : null,
    () => client.settings.getWebSearch(),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ row: string; message: string } | null>(null);

  if (!isDesktopRealtime() || !data) return null;

  const statusOf = new Map(data.providers.map((provider) => [provider.id, provider]));

  const act = async (row: string, run: () => Promise<unknown>) => {
    setBusy(row);
    setError(null);
    try {
      await run();
      reload();
    } catch (err) {
      setError({ row, message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const save = (provider: string) =>
    act(provider, async () => {
      await client.settings.putCredential({ provider, key: draftKey.trim() });
      setEditing(null);
      setDraftKey('');
    });

  return (
    <SettingsGroup
      name={t('webSearch')}
      badge={
        <Badge tone={data.configured ? 'up' : 'down'}>
          {data.configured ? t('enabled') : t('disabled')}
        </Badge>
      }
    >
      <SettingsRow
        label={t('webSearchBackend')}
        description={data.configured ? t('webSearchFallbackOrder') : t('webSearchUnavailable')}
      />
      {WEB_SEARCH_PROVIDERS.map((provider) => {
        const status = statusOf.get(provider.id);
        const configured = status?.configured ?? false;
        const isEditing = editing === provider.id;
        return (
          <SettingsRow
            key={provider.id}
            label={provider.label}
            description={providerNotes[provider.id] ? t(providerNotes[provider.id]) : provider.note}
            mono={
              configured
                ? status?.fromEnv
                  ? t('fromEnvironment', { name: provider.envVar })
                  : t('savedApiKey')
                : t('searchKeyNotConfigured', { name: provider.envVar })
            }
            error={error?.row === provider.id ? error.message : undefined}
          >
            {isEditing ? (
              <>
                <Input
                  autoFocus
                  type="password"
                  placeholder={t('pasteApiKey')}
                  value={draftKey}
                  onChange={(event) => setDraftKey(event.target.value)}
                />
                <Button
                  accent
                  disabled={busy === provider.id || !draftKey.trim()}
                  onClick={() => void save(provider.id)}
                >
                  {t('save')}
                </Button>
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDraftKey('');
                  }}
                >
                  {t('cancel')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => window.open(provider.signupUrl, '_blank', 'noopener,noreferrer')}
                >
                  {t('requestKey')}
                </Button>
                <Button
                  onClick={() => {
                    setEditing(provider.id);
                    setDraftKey('');
                    setError(null);
                  }}
                >
                  {configured ? t('replace') : t('fillIn')}
                </Button>
                {configured && !status?.fromEnv ? (
                  <Button
                    disabled={busy === provider.id}
                    onClick={() =>
                      void act(provider.id, () =>
                        client.settings.deleteCredential({ provider: provider.id }),
                      )
                    }
                  >
                    {t('delete')}
                  </Button>
                ) : null}
              </>
            )}
          </SettingsRow>
        );
      })}
      <SettingsRow
        label={t('localCodexCli')}
        description={t('codexSearchFallback')}
        mono={data.codex.cliAvailable ? t('codexDetected') : t('codexNotDetected')}
        error={error?.row === CODEX_ROW ? error.message : undefined}
      >
        <Switch
          ariaLabel={t('enableCodexSearch')}
          checked={data.codex.enabled}
          disabled={busy === CODEX_ROW}
          onCheckedChange={(next) =>
            void act(CODEX_ROW, () => client.settings.putWebSearchCodex({ enabled: next }))
          }
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
