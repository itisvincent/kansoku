import { useLocale } from '@web/lib/i18n';
import * as stylex from '@stylexjs/stylex';
import { Button, Card } from '../../ui';
import type { CredentialsGetResult } from '../settings/desktopCredentials';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const INSTALL_URL = 'https://open.longbridge.com/docs/cli/install';

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
  welcome: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.6,
    marginBottom: '14px',
  },
  actions: {
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
});

export function StepLongbridge({
  status,
  onRecheck,
}: {
  status: CredentialsGetResult | null;
  onRecheck: () => void;
}) {
  const { t: tr } = useLocale();
  const state = status?.state ?? 'cli_missing';
  const title =
    state === 'cli_missing'
      ? tr('setupLongbridgeInstall')
      : state === 'login_required'
        ? tr('setupLongbridgeLogin')
        : tr('setupLongbridgeRepair');
  const command =
    state === 'cli_missing'
      ? 'curl -fsSL https://open.longbridge.com/longbridge/longbridge-terminal/install | sh'
      : 'longbridge auth login';
  const explanation =
    state === 'cli_missing'
      ? tr('setupLongbridgeInstallHelp')
      : state === 'login_required'
        ? tr('setupLongbridgeLoginHelp')
        : tr('setupLongbridgeRepairHelp');

  return (
    <Card className={`onboarding-card ${stylex.props(styles.card).className}`}>
      <p {...stylex.props(styles.welcome)}>{tr('setupWelcome')}</p>
      <h1 className={stylex.props(styles.heading).className}>{title}</h1>
      <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
        {explanation}
      </p>
      <pre className={`onboarding-cli-command ${stylex.props(styles.cliCommand).className}`}>
        <code>{command}</code>
      </pre>
      {status?.cliPath && (
        <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
          {tr('setupFound')}
          {status.cliPath}
        </p>
      )}
      {status?.lastError && (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {status.lastError}
        </div>
      )}
      <div className={`settings-cred-actions ${stylex.props(styles.actions).className}`}>
        <Button onClick={() => window.open(INSTALL_URL, '_blank', 'noopener,noreferrer')}>
          {tr('setupInstallGuide')}
        </Button>
        <Button accent onClick={onRecheck}>
          {tr('setupRecheck')}
        </Button>
      </div>
    </Card>
  );
}
