import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Badge, Button, Input } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { useLocale } from '@web/lib/i18n';

const styles = stylex.create({
  editor: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': 6,
    'marginTop': 8,
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  button: {
    'flex': 'none',
    'whiteSpace': 'nowrap',
    '@media (max-width: 560px)': {
      justifyContent: 'center',
    },
  },
  error: {
    borderLeftColor: colors.down,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.down,
    fontSize: fontSizes.control,
    marginTop: 7,
    overflowWrap: 'anywhere',
    paddingLeft: 7,
  },
});

export function ProviderBaseUrlField({
  provider,
  baseUrl,
  onChanged,
}: {
  provider: string;
  baseUrl: string | null;
  onChanged: () => void;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState(baseUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await client.settings.putProviderBaseUrl({ provider, baseUrl: value });
      setValue(result.baseUrl ?? '');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`settings-provider-editor ${stylex.props(styles.editor).className}`}>
        <Input
          autoComplete="off"
          className={stylex.props(styles.input).className}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={t('baseUrlOptional')}
          placeholder={t('baseUrlPlaceholder')}
        />
        <Button className={stylex.props(styles.button).className} disabled={busy} onClick={save}>
          {busy ? t('saving') : t('save')}
        </Button>
        {baseUrl ? <Badge tone="accent">{t('customEndpoint')}</Badge> : null}
      </div>
      {error ? (
        <div
          className={`settings-provider-error ${stylex.props(styles.error).className}`}
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </>
  );
}
