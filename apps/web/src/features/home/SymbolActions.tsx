import { useLocale } from '../../lib/i18n';
import { useState } from 'react';
import { Check, Lock, RadioTower } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { trackFeatureUsed } from '@web/lib/analytics';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { loadAnalysisTimeframes } from '@web/features/charts/intraday/timeframes';
import { Button, Switch } from '@web/ui';
import { useFeature } from '@web/features/edition/useFeature';
import { useSymbolFollow } from '@web/features/quotes/useSymbolFollow';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  follow: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'inline-flex',
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    gap: '4px',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },
  followActive: {
    color: colors.accent,
  },
  followCompact: {
    marginLeft: 0,
  },
  followError: {
    color: colors.down,
  },
  followIcon: {
    color: colors.borderStrong,
  },
  followIconActive: {
    color: colors.accent,
  },
  followIconError: {
    color: colors.down,
  },
  followLockIcon: {
    color: colors.accent,
  },
  followLocked: {
    'opacity': 0.65,
    ':hover': {
      opacity: 1,
    },
  },
  visuallyHidden: {
    borderStyle: 'none',
    borderWidth: 0,
    clip: 'rect(0, 0, 0, 0)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: '1px',
  },
  reassess: {
    marginLeft: 'auto',
  },
  reassessIcon: {
    verticalAlign: '-2px',
  },
});

export function FollowToggle({
  symbol,
  initialFollowing,
  compact = false,
}: {
  symbol: string;
  initialFollowing: boolean;
  compact?: boolean;
}) {
  const { t: i18n } = useLocale();
  const { state, guard } = useFeature('symbol-follow');
  const { following, busy, statusError, change } = useSymbolFollow({ symbol, initialFollowing });
  const active = following ?? initialFollowing;
  if (state === 'absent') return null;
  const locked = state === 'locked';

  const onControlClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if ((event.target as Element).closest('.ui-switch') || busy) return;
    const next = !active;
    if (locked && next) {
      guard(() => {});
      return;
    }
    void change(next);
  };

  return (
    <span
      {...stylex.props(
        styles.follow,
        active && styles.followActive,
        Boolean(statusError) && styles.followError,
        locked && styles.followLocked,
        compact && styles.followCompact,
      )}
      title={
        locked
          ? active
            ? i18n('homeFollowLicenseExpired')
            : i18n('homeFollowLicenseNeeded')
          : (statusError ??
            (active ? i18n('homeAiFollowingActive') : i18n('homeAiFollowingInactive')))
      }
      onClick={onControlClick}
    >
      <RadioTower
        {...stylex.props(
          styles.followIcon,
          active && styles.followIconActive,
          Boolean(statusError) && styles.followIconError,
        )}
        aria-hidden="true"
        size={compact ? 12 : 11}
      />
      <span
        className={compact ? `sr-only ${stylex.props(styles.visuallyHidden).className}` : undefined}
      >
        {i18n('homeAiMonitoring')}
      </span>
      {locked && (
        <Lock
          className={`follow-control-lock ${stylex.props(styles.followLockIcon).className}`}
          size={compact ? 12 : 11}
        />
      )}
      <Switch
        ariaLabel={i18n('homeFollowSymbol', { symbol })}
        checked={active}
        disabled={busy}
        onCheckedChange={(checked) => {
          if (locked && checked) {
            guard(() => {});
            return;
          }
          void change(checked);
        }}
      />
    </span>
  );
}

export function ReassessButton({ symbol }: { symbol: string }) {
  const { t: i18n } = useLocale();
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');

  const run = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === 'running') return;
    setState('running');
    try {
      trackFeatureUsed('market_analysis');
      const res = await client.symbols.reassess({
        sym: symbol,
        timeframes: loadAnalysisTimeframes(),
      });
      setState(res.started ? 'done' : 'failed');
    } catch (err) {
      console.warn(`reassess ${symbol}: ${errorMessage(err)}`);
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 4000);
  };

  const labels: Record<typeof state, React.ReactNode> = {
    idle: i18n('homeReanalyze'),
    running: i18n('homeAnalysisRunning'),
    done: (
      <>
        {i18n('homeAnalysisStarted')}
        <Check className={`icon ${stylex.props(styles.reassessIcon).className}`} size={13} />
      </>
    ),
    failed: i18n('homeAnalysisNotStarted'),
  };
  const label = labels[state];
  const btnStates: Record<typeof state, 'busy' | 'done' | 'failed' | undefined> = {
    idle: undefined,
    running: 'busy',
    done: 'done',
    failed: 'failed',
  };
  const btnState = btnStates[state];
  return (
    <Button
      className={stylex.props(styles.reassess).className}
      size="sm"
      state={btnState}
      onClick={run}
      disabled={state === 'running'}
    >
      {label}
    </Button>
  );
}
