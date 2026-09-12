import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '../../lib/api';
import { useQuery } from '../../lib/apiHooks';
import { client } from '../../lib/client';
import type { OpencliStatus } from '../settings/desktopCredentials';
import { Button, Card } from '../../ui';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import { useLocale } from '../../lib/i18n';

const OPENCLI_INSTALL_COMMAND = 'npm install -g @jackwener/opencli';
const OPENCLI_GITHUB_URL = 'https://github.com/jackwener/opencli';
const OPENCLI_RELEASES_URL = 'https://github.com/jackwener/opencli/releases';

const styles = stylex.create({
  card: {
    maxWidth: '480px',
    width: '100%',
  },
  heading: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginBottom: '10px',
  },
  explainer: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.6,
    marginBottom: '14px',
  },
  install: {
    marginTop: '12px',
  },
  cliCommand: {
    backgroundColor: colors.backgroundElement,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    margin: '0 0 14px',
    overflowX: 'auto',
    padding: '12px 14px',
  },
  skipRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '14px',
  },
  credentialActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
  testResult: {
    fontSize: fontSizes.sm,
  },
  testResultFail: {
    color: colors.down,
  },
  skipLink: {
    'backgroundColor': 'transparent',
    'border': 'none',
    'color': {
      'default': colors.textMuted,
      ':hover:not(:disabled)': colors.textPrimary,
    },
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    'padding': 0,
    ':disabled': {
      cursor: 'default',
      opacity: 0.5,
    },
  },
});

function fetchOpencliStatus(): Promise<OpencliStatus> {
  return client.credentials.opencliStatus() as Promise<OpencliStatus>;
}

export function StepTwitter({ onComplete }: { onComplete: () => Promise<void> }) {
  const { t } = useLocale();
  const { data, loading, reload } = useQuery<OpencliStatus>(
    'onboarding.opencli',
    fetchOpencliStatus,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !data) {
    return (
      <Card className={`onboarding-card ${stylex.props(styles.card).className}`}>
        <h1 className={stylex.props(styles.heading).className}>{t('connectX')}/Twitter</h1>
        <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
          {t('checkingOpencli')}
        </p>
      </Card>
    );
  }

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await onComplete();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Card className={`onboarding-card ${stylex.props(styles.card).className}`}>
      <h1 className={stylex.props(styles.heading).className}>{t('connectX')}/Twitter</h1>
      <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
        {t('twitterExplainer')}
      </p>

      {data.state === 'not_installed' ? (
        <div className={`onboarding-install ${stylex.props(styles.install).className}`}>
          <pre className={`onboarding-cli-command ${stylex.props(styles.cliCommand).className}`}>
            <code>{OPENCLI_INSTALL_COMMAND}</code>
          </pre>
          <div
            className={`settings-cred-actions ${stylex.props(styles.credentialActions).className}`}
          >
            <Button onClick={() => void navigator.clipboard.writeText(OPENCLI_INSTALL_COMMAND)}>
              {t('copyCommand')}
            </Button>
            <Button
              onClick={() => window.open(OPENCLI_GITHUB_URL, '_blank', 'noopener,noreferrer')}
            >
              GitHub 链接
            </Button>
          </div>
        </div>
      ) : null}

      {data.state === 'extension_missing' ? (
        <div className={`onboarding-install ${stylex.props(styles.install).className}`}>
          <ol className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
            <li>从 GitHub Releases 下载 opencli-extension 压缩包并解压</li>
            <li>在 Chrome 打开 chrome://extensions 并开启开发者模式</li>
            <li>点击「加载已解压的扩展程序」，选择解压后的目录</li>
          </ol>
          <div
            className={`settings-cred-actions ${stylex.props(styles.credentialActions).className}`}
          >
            <Button
              onClick={() => window.open(OPENCLI_RELEASES_URL, '_blank', 'noopener,noreferrer')}
            >
              {t('downloadExtension')}
            </Button>
          </div>
        </div>
      ) : null}

      {data.state === 'no_session' ? (
        <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
          在 Chrome 里登录 x.com 后点「重新检测」（若已登录，刷新一下 x.com 页面再试）。
        </p>
      ) : null}

      {data.state === 'ready' ? (
        <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
          ✓ X/Twitter 已连接，AI 分析可引用推特消息面
        </p>
      ) : null}

      {data.state !== 'ready' && data.lastError ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(
            styles.testResult,
            styles.testResultFail,
          ).className}`}
        >
          {data.lastError}
        </div>
      ) : null}
      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(
            styles.testResult,
            styles.testResultFail,
          ).className}`}
        >
          {error}
        </div>
      ) : null}

      <div
        className={`settings-cred-actions ${stylex.props(styles.credentialActions).className}`}
      >
        {data.state === 'ready' ? (
          <Button accent disabled={busy} onClick={finish}>
            {t('finish')}
          </Button>
        ) : (
          <Button disabled={busy} onClick={reload}>
            重新检测
          </Button>
        )}
      </div>

      <div className={`onboarding-skip-row ${stylex.props(styles.skipRow).className}`}>
        <button
          className={`onboarding-skip-link ${stylex.props(styles.skipLink).className}`}
          disabled={busy}
          onClick={finish}
        >
          {t('skipConfigureLater')}
        </button>
      </div>
    </Card>
  );
}
