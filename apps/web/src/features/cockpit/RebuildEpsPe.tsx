import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale } from '@web/lib/i18n';
import { Button, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { ANCHOR_CHOICE_KEY, resolveAnchorChoice } from './AnalysisTab';
import { useAnalystRun } from './useAnalystRun';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '10px',
  },
  row: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.5,
  },
});

function readAnchorChoice(): string {
  try {
    return localStorage.getItem(ANCHOR_CHOICE_KEY) ?? 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Starts one analysis run that ignores the saved EPS × PE multiples. A normal run keeps the
 * saved ladder, so this is the only way to reset it on purpose (for example after earnings).
 */
export function RebuildEpsPe({ sym, viewedTf }: { sym: string; viewedTf?: string }) {
  const { t: i18n } = useLocale();
  const anchorTf = resolveAnchorChoice(readAnchorChoice(), viewedTf);
  const run = useAnalystRun(sym, true, anchorTf);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [sym]);

  const busy = run.pending || run.running;

  return (
    <div className={`epspe-rebuild ${stylex.props(styles.root).className}`}>
      <div className={stylex.props(styles.row).className}>
        {confirming ? (
          <>
            <Button
              size="sm"
              danger
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                void run.startWithOptions({ rebuildEpsPe: true });
              }}
            >
              {i18n('chartEpsPeRebuildConfirm')}
            </Button>
            <Button size="sm" onClick={() => setConfirming(false)}>
              {i18n('chartEpsPeRebuildCancel')}
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            {run.running && <Spinner />}
            {run.running ? i18n('cockpitAiRunning') : i18n('chartEpsPeRebuild')}
          </Button>
        )}
      </div>
      <span className={stylex.props(styles.hint).className}>
        {run.hint ?? i18n('chartEpsPeRebuildHint')}
      </span>
    </div>
  );
}
