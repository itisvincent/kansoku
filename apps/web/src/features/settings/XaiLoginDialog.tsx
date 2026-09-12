import { useEffect, useEffectEvent, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { XaiLoginState } from '@kansoku/core/contract/settings';
import { client } from '@web/lib/client';
import { errorMessage } from '@web/lib/api';
import { useLocale } from '@web/lib/i18n';
import { Button } from '@web/ui';
import { colors, fonts } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: { display: 'grid', gap: '14px' },
  description: { color: colors.textSecondary, lineHeight: 1.6, margin: 0 },
  code: { fontFamily: fonts.mono, fontSize: '24px', textAlign: 'center', userSelect: 'all' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' },
});

export function XaiLoginDialog({
  closeModal,
  onConnected,
}: {
  closeModal: () => void;
  onConnected: () => void;
}) {
  const { t } = useLocale();
  const [login, setLogin] = useState<XaiLoginState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const complete = useEffectEvent(() => {
    onConnected();
    closeModal();
  });

  useEffect(() => {
    let cancelled = false;
    let sessionId: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (state: XaiLoginState) => {
      if (cancelled) return;
      setLogin(state);
      if (state.status === 'connected') {
        complete();
      } else if (state.status === 'pending') {
        timer = setTimeout(() => {
          void poll();
        }, 1000);
      }
    };
    const poll = async () => {
      try {
        update(await client.settings.pollXaiLogin({ sessionId: sessionId! }));
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      }
    };
    void client.settings
      .startXaiLogin()
      .then((state) => {
        sessionId = state.sessionId;
        if (cancelled) {
          void client.settings.cancelXaiLogin({ sessionId }).catch(() => {});
          return;
        }
        update(state);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (sessionId) void client.settings.cancelXaiLogin({ sessionId }).catch(() => {});
    };
  }, []);

  return (
    <div {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.description)}>{t('xaiLoginDescription')}</p>
      {login?.userCode ? <div {...stylex.props(styles.code)}>{login.userCode}</div> : null}
      {error || login?.status === 'error' ? (
        <div role="alert">{error ?? login?.error}</div>
      ) : (
        <div role="status">
          {login?.status === 'cancelled'
            ? t('xaiLoginCancelled')
            : login?.userCode
              ? t('waitingForBrowser')
              : t('starting')}
        </div>
      )}
      <div {...stylex.props(styles.actions)}>
        <Button onClick={closeModal}>{t('cancel')}</Button>
        {login?.status === 'pending' && login.userCode && login.verificationUri ? (
          <>
            <Button onClick={() => void navigator.clipboard.writeText(login.userCode!)}>
              {t('copyVerificationCode')}
            </Button>
            <Button
              accent
              onClick={() => window.open(login.verificationUri, '_blank', 'noopener,noreferrer')}
            >
              {t('openXaiLogin')}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
