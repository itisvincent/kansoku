import { useLocale } from '@web/lib/i18n';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  TrainerErrorCode,
  TrainerFillPhase,
  TrainerFillTask,
  TrainerView,
} from '@kansoku/pro-api';
import * as stylex from '@stylexjs/stylex';
import { trackFeatureUsed } from '@web/lib/analytics';
import { errorMessage } from '@web/lib/api';
import { Button } from '@web/ui';
import { getTrainerBridge } from '../desktop/desktopTrainerBridge';
import { getShellRpc } from '../desktop/shellRpc';
import { TrainerChart } from './TrainerChart';
import { useTrainerFill } from './useTrainerFill';
import { colors, fontSizes, fonts, radii } from '../../theme/tokens.stylex';

const fillPulse = stylex.keyframes({
  '50%': { opacity: 0.35 },
});

const styles = stylex.create({
  boot: {
    backgroundColor: colors.backgroundCanvas,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
  bootBar: {
    WebkitAppRegion: 'drag',
    display: 'flex',
    flexShrink: 0,
    padding: '8px 12px',
  },
  trafficSpacer: {
    flex: '0 0 66px',
  },
  bootScroll: {
    alignItems: 'center',
    display: 'flex',
    flex: '1 1 auto',
    justifyContent: 'center',
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px 24px 40px',
  },
  bootShell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    maxWidth: '420px',
    width: '100%',
  },
  bootHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  bootName: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    letterSpacing: '0.02em',
    margin: 0,
  },
  bootThesis: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.7,
    margin: 0,
  },
  bootSteps: {
    display: 'flex',
    flexDirection: 'column',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  bootStep: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'flex',
    gap: '12px',
    padding: '10px 0',
  },
  bootStepIndex: {
    color: colors.textMuted,
    flex: 'none',
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    width: '18px',
  },
  bootStepText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  bootStepTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: 600,
  },
  bootStepBody: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.6,
  },
  bootStatus: {
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
  },
  bootStatusAlone: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    textAlign: 'center',
  },
  bootStatusRow: {
    alignItems: 'baseline',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    width: '100%',
  },
  bootStatusTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: 600,
  },
  bootStatusCount: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: fontSizes.md,
    fontVariantNumeric: 'tabular-nums',
  },
  bootStatusDetail: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
  },
  fillPipeline: {
    display: 'grid',
    gap: '4px',
    gridTemplateColumns: 'repeat(6, 1fr)',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    width: '100%',
  },
  fillPhase: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    minWidth: 0,
  },
  fillPhaseBar: {
    backgroundColor: colors.borderStrong,
    height: '2px',
  },
  fillPhaseBarDone: {
    backgroundColor: colors.accent,
    opacity: 0.4,
  },
  fillPhaseBarActive: {
    'animationDuration': '1.4s',
    'animationIterationCount': 'infinite',
    'animationName': fillPulse,
    'animationTimingFunction': 'ease-in-out',
    'backgroundColor': colors.accent,
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
  fillPhaseLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fillPhaseLabelActive: {
    color: colors.textPrimary,
  },
});

const BASE_PERIOD = '5m';
const REFILL_TARGET = 15;

// The pool's own stages, in the order a fill walks them. Naming them turns a wait with nothing on
// screen into the one thing worth watching here: cases being screened out of years of tape.

interface TrainerSession {
  sessionId: string;
  view: TrainerView;
}

interface OpenFailure {
  code: TrainerErrorCode | null;
  message: string;
}

function TrainerBoot({ children }: { children: ReactNode }) {
  const isDesktop = getShellRpc() !== null;
  return (
    <div className={`trainer-boot ${stylex.props(styles.boot).className}`}>
      <div className={`trainer-boot-bar ${stylex.props(styles.bootBar).className}`}>
        {isDesktop && (
          <div
            className={`popout-traffic-spacer ${stylex.props(styles.trafficSpacer).className}`}
          />
        )}
      </div>
      <div className={`trainer-boot-scroll ${stylex.props(styles.bootScroll).className}`}>
        <div className={`trainer-boot-shell ${stylex.props(styles.bootShell).className}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

function TrainerNotice({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string | null;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <TrainerBoot>
      <div
        className={`trainer-boot-status trainer-boot-status--alone ${stylex.props(styles.bootStatus, styles.bootStatusAlone).className}`}
      >
        <div
          className={`trainer-boot-status-title ${stylex.props(styles.bootStatusTitle).className}`}
        >
          {title}
        </div>
        {detail && (
          <div
            className={`trainer-boot-status-detail ${stylex.props(styles.bootStatusDetail).className}`}
          >
            {detail}
          </div>
        )}
        {action && (
          <Button disabled={action.disabled} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </TrainerBoot>
  );
}

function Playbook() {
  const { t: tr } = useLocale();
  const PLAYBOOK = [
    { title: tr('trainHowDirection'), body: tr('trainHowDirectionHelp') },
    { title: tr('trainHowLines'), body: tr('trainHowLinesHelp') },
    { title: tr('trainHowAdvance'), body: tr('trainHowAdvanceHelp') },
    { title: tr('trainHowSettle'), body: tr('trainHowSettleHelp') },
  ];

  return (
    <>
      <header className={`trainer-boot-head ${stylex.props(styles.bootHead).className}`}>
        <h1 className={`trainer-boot-name ${stylex.props(styles.bootName).className}`}>
          {tr('trainBlind')}
        </h1>
        <p className={`trainer-boot-thesis ${stylex.props(styles.bootThesis).className}`}>
          {tr('trainIntro')}
        </p>
      </header>
      <ol className={`trainer-boot-steps ${stylex.props(styles.bootSteps).className}`}>
        {PLAYBOOK.map((step, index) => (
          <li
            key={step.title}
            className={`trainer-boot-step ${stylex.props(styles.bootStep).className}`}
          >
            <span
              className={`trainer-boot-step-index ${stylex.props(styles.bootStepIndex).className}`}
            >
              {index + 1}
            </span>
            <div
              className={`trainer-boot-step-text ${stylex.props(styles.bootStepText).className}`}
            >
              <span
                className={`trainer-boot-step-title ${stylex.props(styles.bootStepTitle).className}`}
              >
                {step.title}
              </span>
              <span
                className={`trainer-boot-step-body ${stylex.props(styles.bootStepBody).className}`}
              >
                {step.body}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function FillPipeline({ task }: { task: TrainerFillTask }) {
  const { t: tr } = useLocale();
  const FILL_PHASES: { key: TrainerFillPhase; label: string }[] = [
    { key: 'sample', label: tr('trainSample') },
    { key: 'hard-rule-gate', label: tr('trainRules') },
    { key: 'assemble', label: tr('trainBuildMarket') },
    { key: 'ai-pick', label: tr('trainAiPick') },
    { key: 'anonymize', label: tr('trainHideIdentity') },
    { key: 'audit', label: tr('trainRecheck') },
  ];

  const active = FILL_PHASES.findIndex((phase) => phase.key === task.phase);
  return (
    <ol
      className={`trainer-fill-pipeline ${stylex.props(styles.fillPipeline).className}`}
      aria-label={task.activity}
    >
      {FILL_PHASES.map((phase, index) => {
        const done = index < active;
        const current = index === active;
        const state = done ? ' is-done' : current ? ' is-active' : '';
        return (
          <li
            key={phase.key}
            className={`trainer-fill-phase${state} ${stylex.props(styles.fillPhase).className}`}
          >
            <span
              className={`trainer-fill-phase-bar ${
                stylex.props(
                  styles.fillPhaseBar,
                  done && styles.fillPhaseBarDone,
                  current && styles.fillPhaseBarActive,
                ).className
              }`}
            />
            <span
              className={`trainer-fill-phase-label ${
                stylex.props(styles.fillPhaseLabel, current && styles.fillPhaseLabelActive)
                  .className
              }`}
            >
              {phase.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PoolStatus({
  task,
  suspended,
  error,
  onRefill,
  refilling,
}: {
  task: TrainerFillTask | null;
  suspended: boolean;
  error: string | null;
  onRefill: () => void;
  refilling: boolean;
}) {
  const { t: tr } = useLocale();
  if (task?.status === 'running')
    return (
      <div className={`trainer-boot-status ${stylex.props(styles.bootStatus).className}`}>
        <div className={`trainer-boot-status-row ${stylex.props(styles.bootStatusRow).className}`}>
          <span
            className={`trainer-boot-status-title ${stylex.props(styles.bootStatusTitle).className}`}
          >
            {tr('trainBuildingCases')}
          </span>
          <span
            className={`trainer-boot-status-count ${stylex.props(styles.bootStatusCount).className}`}
          >
            {task.admitted}/{task.requested}
          </span>
        </div>
        <FillPipeline task={task} />
        <div
          className={`trainer-boot-status-detail ${stylex.props(styles.bootStatusDetail).className}`}
        >
          {task.activity}
        </div>
      </div>
    );

  const title = suspended ? tr('trainRefillPaused') : tr('trainPoolEmpty');
  const detail =
    error ??
    (task?.status === 'failed'
      ? tr('trainRefillFailed', { value1: task.error ?? tr('trainUnknownReason') })
      : null);
  return (
    <div className={`trainer-boot-status ${stylex.props(styles.bootStatus).className}`}>
      <div className={`trainer-boot-status-row ${stylex.props(styles.bootStatusRow).className}`}>
        <span
          className={`trainer-boot-status-title ${stylex.props(styles.bootStatusTitle).className}`}
        >
          {title}
        </span>
      </div>
      {detail && (
        <div
          className={`trainer-boot-status-detail ${stylex.props(styles.bootStatusDetail).className}`}
        >
          {detail}
        </div>
      )}
      <Button disabled={refilling} onClick={onRefill}>
        {tr('trainRefill')}
      </Button>
    </div>
  );
}

export function TrainerLauncher() {
  const { t: tr } = useLocale();
  const bridge = useMemo(() => getTrainerBridge(), []);
  const [session, setSession] = useState<TrainerSession | null>(null);
  const [failure, setFailure] = useState<OpenFailure | null>(null);
  const [opening, setOpening] = useState(bridge !== null);
  const [attempt, setAttempt] = useState(0);
  const [refilledTaskId, setRefilledTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge
      .open({ basePeriod: BASE_PERIOD })
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          trackFeatureUsed('training_session', { stage: 'started' });
          setSession({ sessionId: result.data.sessionId, view: result.data.view });
        } else setFailure({ code: result.code, message: result.error });
      })
      .catch((error: unknown) => {
        if (active) setFailure({ code: null, message: errorMessage(error) });
      })
      .finally(() => {
        if (active) setOpening(false);
      });
    return () => {
      active = false;
    };
  }, [bridge, attempt]);

  const reopen = () => {
    setFailure(null);
    setOpening(true);
    setAttempt((current) => current + 1);
  };

  const poolEmpty = failure?.code === 'TRAINER_POOL_EMPTY';
  const fill = useTrainerFill(bridge !== null && poolEmpty);
  const task = fill.state.task;
  const admittedTaskId = task?.status === 'done' && task.admitted > 0 ? task.id : null;

  // An open that found the pool empty has already kicked off a refill on the pro side, so this
  // window is both the one that reported the dead end and the one that can undo it. Reopening
  // during render (see TrainerChart's case-id reset for the same idiom) keeps the trader from ever
  // seeing a "the pool filled up" screen they would have to acknowledge by hand.
  if (admittedTaskId && admittedTaskId !== refilledTaskId && !session) {
    setRefilledTaskId(admittedTaskId);
    reopen();
  }

  if (session)
    return (
      <TrainerChart
        view={session.view}
        sessionId={session.sessionId}
        bridge={bridge ?? undefined}
        onViewChange={(view) => setSession((prev) => (prev ? { ...prev, view } : prev))}
      />
    );

  if (!bridge) return <TrainerNotice title={tr('trainDesktopOnly')} />;
  if (opening) return <TrainerNotice title={tr('trainStarting')} />;

  if (poolEmpty)
    return (
      <TrainerBoot>
        <Playbook />
        <PoolStatus
          task={task}
          suspended={fill.state.autoRefillSuspended}
          error={fill.error}
          refilling={fill.pending}
          onRefill={() =>
            fill.startFill(BASE_PERIOD, Math.max(1, REFILL_TARGET - (task?.admitted ?? 0)))
          }
        />
      </TrainerBoot>
    );

  return (
    <TrainerNotice
      title={tr('trainCannotOpen')}
      detail={failure?.message}
      action={{ label: tr('trainRetry'), onClick: reopen }}
    />
  );
}
