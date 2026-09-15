import * as stylex from '@stylexjs/stylex';
import { Button, Dot, Input } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { ProviderBaseUrlField } from './ProviderBaseUrlField';
import type { CatalogProvider, CredentialEntry } from './types';
import { useLocale, type MessageKey } from '@web/lib/i18n';

const styles = stylex.create({
  row: {
    'borderTopColor': colors.border,
    'borderTopStyle': 'solid',
    'borderTopWidth': '1px',
    'padding': '10px 11px',
    ':first-child': {
      borderTopStyle: 'none',
    },
  },
  head: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 500,
  },
  state: {
    alignItems: 'center',
    display: 'inline-flex',
    fontSize: fontSizes.sm,
    gap: '5px',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },
  stateUp: { color: colors.up },
  stateAccent: { color: colors.accent },
  stateMuted: { color: colors.textMuted },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  controls: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': '6px',
    'marginTop': '8px',
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  editorButton: {
    '@media (max-width: 560px)': {
      justifyContent: 'center',
    },
  },
  editorInput: {
    flex: 1,
    minWidth: 0,
  },
  error: {
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.down,
    fontSize: fontSizes.control,
    marginTop: '7px',
    overflowWrap: 'anywhere',
    paddingLeft: '7px',
  },
});

function credentialMeta(
  credential: CredentialEntry | undefined,
  t: (key: MessageKey) => string,
): string {
  if (!credential) return t('noSavedKey');
  if (!credential.ok) return t('credentialUnreadable');
  return (
    (credential.kind === 'oauth' ? t('subscriptionConnected') : (credential.masked ?? t('saved'))) +
    ' · ' +
    credential.updatedAt.slice(0, 10)
  );
}

function providerState(
  credential: CredentialEntry | undefined,
  t: (key: MessageKey) => string,
): {
  label: string;
  tone: 'up' | 'accent' | 'muted';
} {
  if (!credential) return { label: t('notConfigured'), tone: 'muted' };
  if (!credential.ok) return { label: t('reconnectRequired'), tone: 'accent' };
  return { label: credential.kind === 'oauth' ? t('connected') : t('saved'), tone: 'up' };
}

export function ProviderAuthRow({
  provider,
  credential,
  baseUrl,
  editing,
  editKey,
  busy,
  error,
  onStartEdit,
  onEditKey,
  onSave,
  onCancel,
  onDelete,
  onChanged,
  onLogin,
}: {
  provider: CatalogProvider;
  credential: CredentialEntry | undefined;
  baseUrl: string | null;
  editing: boolean;
  editKey: string;
  busy: boolean;
  error: string | null;
  onStartEdit: () => void;
  onEditKey: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onChanged: () => void;
  onLogin?: () => void;
}) {
  const { t } = useLocale();
  const state = providerState(credential, t);
  const stateStyle =
    state.tone === 'up'
      ? styles.stateUp
      : state.tone === 'accent'
        ? styles.stateAccent
        : styles.stateMuted;

  return (
    <div
      className={`settings-provider-row ${stylex.props(styles.row).className}`}
      id={'settings-provider-' + provider.id}
    >
      <div className={`settings-provider-head ${stylex.props(styles.head).className}`}>
        <span className={`settings-provider-name ${stylex.props(styles.name).className}`}>
          {provider.id === 'xai' ? 'xAI / Grok' : provider.name}
        </span>
        <span
          className={`settings-provider-state settings-provider-state--${state.tone} ${stylex.props(styles.state, stateStyle).className}`}
        >
          <Dot tone={state.tone === 'muted' ? undefined : state.tone} />
          {state.label}
        </span>
      </div>
      <div className={`settings-provider-meta ${stylex.props(styles.meta).className}`}>
        {credentialMeta(credential, t)}
      </div>
      {provider.id === 'ollama-cloud' ? (
        <div {...stylex.props(styles.controls)}>
          <a href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer">
            {t('ollamaGetKey')}
          </a>
          <span {...stylex.props(styles.meta)}>{t('ollamaCloudSubscription')}</span>
        </div>
      ) : null}
      {onLogin ? (
        <div {...stylex.props(styles.controls)}>
          <Button onClick={onLogin} disabled={busy}>
            {t('xaiLogin')}
          </Button>
          <span {...stylex.props(styles.meta)}>{t('xaiSubscription')}</span>
        </div>
      ) : null}
      {editing ? (
        <div className={`settings-provider-editor ${stylex.props(styles.controls).className}`}>
          <Input
            className={stylex.props(styles.editorInput).className}
            autoComplete="off"
            type="password"
            value={editKey}
            onChange={(event) => onEditKey(event.target.value)}
            placeholder="API key"
          />
          <Button
            className={stylex.props(styles.editorButton).className}
            disabled={busy || !editKey}
            onClick={onSave}
          >
            {busy ? t('saving') : t('save')}
          </Button>
          <Button
            className={stylex.props(styles.editorButton).className}
            disabled={busy}
            onClick={onCancel}
          >
            {t('cancel')}
          </Button>
        </div>
      ) : (
        <div className={`settings-provider-actions ${stylex.props(styles.controls).className}`}>
          <Button onClick={onStartEdit}>{credential ? t('updateKey') : t('addKey')}</Button>
          {credential ? (
            <Button disabled={busy} onClick={onDelete}>
              {busy ? t('deleting') : credential.kind === 'oauth' ? t('signOut') : t('delete')}
            </Button>
          ) : null}
        </div>
      )}
      {credential?.kind !== 'oauth' ? (
        <ProviderBaseUrlField
          key={baseUrl ?? ''}
          provider={provider.id}
          baseUrl={baseUrl}
          onChanged={onChanged}
        />
      ) : null}
      {error ? (
        <div
          className={`settings-provider-error ${stylex.props(styles.error).className}`}
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
