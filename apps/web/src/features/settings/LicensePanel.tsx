import { useLocale, translate, type Locale } from '../../lib/i18n';
import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { useQuery } from '@web/lib/apiHooks';
import { refreshCapabilities, useCapabilities } from '@web/features/edition/capabilitiesStore';
import { client } from '@web/lib/client';
import { openLicenseModal } from '@web/features/edition/licenseModalStore';
import { getDesktopAppControlBridge } from './desktopAppControl';
import { Badge, Button, Input, openModal } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { SettingsConfirmActions, SettingsConfirmDialog } from './openSettingsConfirm';
import { SettingsField, SettingsRow } from './SettingsGroup';

const styles = stylex.create({
  preference: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': '12px',
    'justifyContent': 'space-between',
    'padding': '11px',
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  preferenceCopy: {
    minWidth: 0,
  },
  preferenceName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 500,
  },
  preferenceDescription: {
    marginTop: '3px',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    overflowWrap: 'anywhere',
  },
  testResult: {
    fontSize: fontSizes.control,
  },
  testResultFail: {
    color: colors.down,
  },
  activateRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '8px',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    minWidth: 0,
    flex: 1,
  },
  invalidNotice: {
    color: colors.down,
  },
  expiredNotice: {
    color: colors.accent,
  },
  restartNotice: {
    color: colors.accent,
  },
  subscribeLink: {
    'alignSelf': 'flex-start',
    'padding': 0,
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'cursor': 'pointer',
    'color': colors.accent,
    'fontSize': fontSizes.control,
    ':hover': {
      textDecoration: 'underline',
    },
  },
  deactivateButton: {
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
  },
});

function activateErrorMessage(raw: string, locale: Locale): string {
  const t = (key: 'invalidLicenseKey' | 'licenseDeviceLimit') => translate(locale, key);
  if (/responded (401|404)/.test(raw)) return t('invalidLicenseKey');
  if (/responded (409|422)/.test(raw)) return t('licenseDeviceLimit');
  return translate(locale, 'activationFailed', { error: raw });
}

function DeactivateConfirm({ closeModal }: { closeModal: () => void }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deactivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.license.deactivate();
      await refreshCapabilities();
      closeModal();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsConfirmDialog danger message={t('deactivateLicenseHint')}>
      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {error}
        </div>
      ) : null}
      <SettingsConfirmActions>
        <Button disabled={busy} onClick={closeModal}>
          {t('cancel')}
        </Button>
        <Button danger disabled={busy} onClick={() => void deactivate()}>
          {busy ? t('deactivating') : t('confirmDeactivate')}
        </Button>
      </SettingsConfirmActions>
    </SettingsConfirmDialog>
  );
}

export function useSubscribeInfo() {
  const { data } = useQuery('settings.getSubscribeUrl', () => client.settings.getSubscribeUrl());
  return data ?? null;
}

export function ActivateForm({
  notice,
  showSubscribeLink = true,
  onActivated,
}: {
  notice?: 'invalid' | 'expired';
  showSubscribeLink?: boolean;
  onActivated?: () => void;
}) {
  const { t, locale } = useLocale();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscribeData = useSubscribeInfo();

  const activate = async () => {
    const trimmed = key.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.license.activate({ key: trimmed });
      if (!result.activated) {
        setError(activateErrorMessage(result.error, locale));
        return;
      }
      const caps = await refreshCapabilities();
      setKey('');
      // When pro doesn't hot-mount (encrypted slot, key just became available),
      // stay put so the caller re-renders into LicensePanel's licensed view,
      // which carries the restart-required notice — closing here would hide it.
      if (caps?.licensed && !caps.pro) return;
      onActivated?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`settings-time-preference ${stylex.props(styles.activateRow).className}`}>
      {notice === 'invalid' ? (
        <div
          className={`settings-preference-description ${stylex.props(styles.invalidNotice).className}`}
        >
          {t('invalidLicenseNotice')}
        </div>
      ) : null}
      {notice === 'expired' ? (
        <div
          className={`settings-preference-description ${stylex.props(styles.expiredNotice).className}`}
        >
          {t('expiredLicenseNotice')}
        </div>
      ) : null}
      <div className={stylex.props(styles.inputRow).className}>
        <Input
          className={stylex.props(styles.input).className}
          placeholder={t('enterLicenseKey')}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void activate();
          }}
          disabled={busy}
        />
        <Button accent disabled={busy || !key.trim()} onClick={() => void activate()}>
          {busy ? t('activating') : t('activate')}
        </Button>
      </div>
      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {error}
        </div>
      ) : null}
      {showSubscribeLink && subscribeData?.subscribeUrl ? (
        <button
          type="button"
          className={stylex.props(styles.subscribeLink).className}
          onClick={() => openLicenseModal('guard')}
        >
          {t('noLicenseKey')}
          {subscribeData.trialDays
            ? t('freeTrialDays', { days: subscribeData.trialDays })
            : t('subscribe')}
        </button>
      ) : null}
    </div>
  );
}

function LicensedStatus({
  state,
  deviceName,
  maskedKey,
  graceUntil,
  restartRequired,
  proUnavailable,
}: {
  state: 'licensed' | 'grace';
  deviceName?: string;
  maskedKey?: string;
  graceUntil?: string;
  restartRequired?: boolean;
  proUnavailable?: boolean;
}) {
  const { t, locale } = useLocale();
  return (
    <SettingsRow
      label={
        state === 'grace' ? (
          <Badge tone="accent">{t('offlineGrace')}</Badge>
        ) : (
          <Badge tone="up">{t('licensed')}</Badge>
        )
      }
      description={
        <>
          {maskedKey ? t('licenseKeyValue', { key: maskedKey }) : null}
          {deviceName ? ` · ${t('licenseDeviceValue', { device: deviceName })}` : null}
          {state === 'grace' && graceUntil
            ? ` · ${t('licenseGraceUntil', { time: new Date(graceUntil).toLocaleString(locale) })}`
            : null}
        </>
      }
      error={
        restartRequired ? (
          getDesktopAppControlBridge() ? (
            <>
              {t('paidAiRestartHint')}
              <Button onClick={() => void getDesktopAppControlBridge()?.relaunch()}>
                {t('restartNow')}
              </Button>
            </>
          ) : (
            t('paidAiManualRestartHint')
          )
        ) : proUnavailable ? (
          t('paidAiUnavailable')
        ) : undefined
      }
    >
      <Button
        onClick={() =>
          openModal({
            title: t('deactivateDevice'),
            size: 'sm',
            body: (closeModal) => <DeactivateConfirm closeModal={closeModal} />,
          })
        }
      >
        {t('deactivateDevice')}
      </Button>
    </SettingsRow>
  );
}

export function LicensePanel() {
  const { t } = useLocale();
  const { licensed, license, pro, hasEncBundle } = useCapabilities();

  if (licensed) {
    return (
      <LicensedStatus
        state={license?.state === 'grace' ? 'grace' : 'licensed'}
        deviceName={license?.deviceName}
        maskedKey={license?.maskedKey}
        graceUntil={license?.graceUntil}
        restartRequired={!pro && !!hasEncBundle}
        proUnavailable={!pro && !hasEncBundle}
      />
    );
  }

  const notice =
    license?.state === 'invalid' ? 'invalid' : license?.state === 'expired' ? 'expired' : undefined;
  return (
    <SettingsField label={t('activate')} description={t('activateLicenseHint')}>
      <ActivateForm notice={notice} />
    </SettingsField>
  );
}
