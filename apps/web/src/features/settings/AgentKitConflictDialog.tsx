import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@web/ui';
import type { PendingConflict } from '@kansoku/core/contract/agentKit';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import type { DesktopAgentKitBridge } from './desktopAgentKit';
import { useLocale } from '../../lib/i18n';

const styles = stylex.create({
  testResult: {
    fontSize: fontSizes.control,
  },
  testResultFail: {
    color: colors.down,
  },
  credActions: {
    display: 'grid',
    gap: '8px',
    marginTop: '12px',
  },
});

export function AgentKitConflictDialog({
  conflict,
  bridge,
  onResolved,
  close,
}: {
  conflict: PendingConflict;
  bridge: DesktopAgentKitBridge;
  onResolved: () => void;
  close: () => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (choice: 'use-template' | 'keep-original') => {
    setBusy(true);
    setError(null);
    try {
      await bridge.resolveConflict({ dest: conflict.dest, choice });
      onResolved();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-reset-confirm">
      <p>{t('conflictDescription', { file: conflict.dest })}</p>
      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {error}
        </div>
      ) : null}
      <div className={`settings-cred-actions ${stylex.props(styles.credActions).className}`}>
        <Button disabled={busy} onClick={close}>
          {t('later')}
        </Button>
        <Button disabled={busy} onClick={() => void resolve('keep-original')}>
          {t('keepOriginal')}
        </Button>
        <Button accent disabled={busy} onClick={() => void resolve('use-template')}>
          {t('useKitTemplate')}
        </Button>
      </div>
    </div>
  );
}
