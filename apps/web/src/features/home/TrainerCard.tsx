import type { MessageKey, MessageParams } from '../../lib/i18n';
import { useLocale } from '../../lib/i18n';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GraduationCap } from 'lucide-react';
import type { TrainerFillState } from '@kansoku/pro-api';
import * as stylex from '@stylexjs/stylex';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { getOpenTrainerBridge } from '@web/features/desktop/desktopWindowsBridge';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { requestTrainerWindow } from '@web/features/training/requestTrainerWindow';
import { useTrainerFill } from '@web/features/training/useTrainerFill';
import { Button, Card, SectionTitle } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const BASE_PERIOD = '5m';
const REFILL_TARGET = 15;

const styles = stylex.create({
  card: {
    alignItems: 'center',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    padding: '10px 12px',
  },
  body: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    minWidth: 0,
  },
  bodyIcon: {
    flex: '0 0 auto',
    opacity: 0.75,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
    gap: '6px',
  },
  cancel: {
    'backgroundColor': 'transparent',
    'borderColor': 'transparent',
    'color': colors.textMuted,
    ':hover': {
      color: colors.textPrimary,
    },
  },
  stats: {
    'alignSelf': 'center',
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
});

interface CardCopy {
  hint: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
  cancel?: boolean;
}

function copyFor(
  fill: TrainerFillState,
  pool: number | null,
  open: () => void,
  refill: () => void,
  i18n: (key: MessageKey, params?: MessageParams) => string,
): CardCopy {
  const task = fill.task;
  if (task?.status === 'running') {
    return {
      hint: i18n('homeAdmittedCases', { activity: task.activity, count: task.admitted }),
      action: i18n('homeRefillingCases'),
      onAction: () => {},
      disabled: true,
      cancel: true,
    };
  }
  if (pool != null && pool > 0) {
    return {
      hint: i18n('homeCasesAvailable', { count: pool }),
      action: i18n('homeStartTrainingSession'),
      onAction: open,
    };
  }
  // The self-suspended state has to be spoken out loud, otherwise the user meets a
  // pool that silently stopped refilling and has nowhere to look.
  if (fill.autoRefillSuspended) {
    return {
      hint: i18n('homeCaseRefillSuspended'),
      action: i18n('homeRefillCasesManually'),
      onAction: refill,
    };
  }
  if (task?.status === 'failed') {
    return {
      hint: i18n('homeCaseRefillError', { error: task.error ?? i18n('homeUnknownReason') }),
      action: i18n('homeRetryCaseRefill'),
      onAction: refill,
    };
  }
  if (task?.status === 'done' && task.admitted === 0) {
    return {
      hint: i18n('homeNoSuitableCasesFound'),
      action: i18n('homeRetryCaseRefill'),
      onAction: refill,
    };
  }
  if (pool === null)
    return { hint: i18n('homeCasePoolLoading'), action: i18n('homeRefillCases'), onAction: refill };
  return { hint: i18n('homeCasePoolEmpty'), action: i18n('homeRefillCases'), onAction: refill };
}

export function TrainerCard() {
  const { t: i18n } = useLocale();
  const { pro, licensed } = useCapabilities();
  const [pool, setPool] = useState<number | null>(null);
  const ready = pro === true && licensed;
  const fill = useTrainerFill(ready);
  const runningId = fill.state.task?.status === 'running' ? fill.state.task.id : null;

  const reloadPool = useCallback(() => {
    if (!ready) return;
    const bridge = getTrainerBridge();
    if (!bridge) return;
    bridge
      .listPool()
      .then((result) => {
        if (result.ok) setPool(result.data.byBasePeriod[BASE_PERIOD] ?? 0);
      })
      .catch(() => {});
  }, [ready]);

  // Re-read once a refill stops running, so the count reflects what it admitted.
  useEffect(() => {
    reloadPool();
  }, [reloadPool, runningId]);

  const openBridge = getOpenTrainerBridge();
  if (!openBridge || pro !== true) return null;

  const copy = licensed
    ? copyFor(
        fill.state,
        pool,
        () => requestTrainerWindow(openBridge, { pro, licensed }),
        () => fill.startFill(BASE_PERIOD, Math.max(1, REFILL_TARGET - (pool ?? 0))),
        i18n,
      )
    : {
        hint: i18n('homeAvailableWithSubscription'),
        action: i18n('homeViewSubscriptionOptions'),
        onAction: () => requestTrainerWindow(openBridge, { pro, licensed }),
      };

  return (
    <>
      <SectionTitle>{i18n('homeBlindTraining')}</SectionTitle>
      <Card className={`trainer-card ${stylex.props(styles.card).className}`}>
        <div className={`trainer-card-body ${stylex.props(styles.body).className}`}>
          <GraduationCap {...stylex.props(styles.bodyIcon)} size={18} aria-hidden />
          <span className={`trainer-card-hint ${stylex.props(styles.hint).className}`}>
            {fill.error ?? copy.hint}
          </span>
        </div>
        <div className={`trainer-card-actions ${stylex.props(styles.actions).className}`}>
          <Button disabled={copy.disabled || fill.pending} onClick={copy.onAction}>
            {copy.action}
          </Button>
          {copy.cancel && (
            <Button
              className={`trainer-card-cancel ${stylex.props(styles.cancel).className}`}
              onClick={fill.abortFill}
            >
              {i18n('homeCancel')}
            </Button>
          )}
          {licensed && (
            <Link
              className={`trainer-card-stats ${stylex.props(styles.stats).className}`}
              to="/training/stats"
            >
              {i18n('homeViewTrainingStats')}
            </Link>
          )}
        </div>
      </Card>
    </>
  );
}
