import { useLocale } from '@web/lib/i18n';
import { Lock, RadioTower } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { Switch } from '@web/ui';
import { useFeature } from '@web/features/edition/useFeature';
import { useSymbolFollow } from '@web/features/quotes/useSymbolFollow';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  control: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    whiteSpace: 'nowrap',
  },
  icon: {
    color: colors.accent,
  },
  error: {
    color: colors.down,
  },
  errorIcon: {
    color: colors.down,
  },
  locked: {
    'opacity': 0.65,
    ':hover': {
      opacity: 1,
    },
  },
  lock: {
    color: colors.accent,
  },
});

export function FollowAction({
  symbol,
  revision,
  className,
}: {
  symbol: string;
  revision?: string;
  className?: string;
}) {
  const { state } = useFeature('symbol-follow');
  if (state === 'absent') return null;
  return (
    <FollowControl
      symbol={symbol}
      revision={revision}
      locked={state === 'locked'}
      className={className}
    />
  );
}

function FollowControl({
  symbol,
  revision,
  locked,
  className,
}: {
  symbol: string;
  revision?: string;
  locked: boolean;
  className?: string;
}) {
  const { t: i18n } = useLocale();
  const { following, busy, statusError, change } = useSymbolFollow({ symbol, revision });
  const { guard } = useFeature('symbol-follow');

  return (
    <span
      className={`follow-control ${className ?? ''} ${stylex.props(styles.control, Boolean(statusError) && styles.error, locked && styles.locked).className}`}
      title={
        locked
          ? following
            ? i18n('cockpitFollowExpired')
            : i18n('cockpitFollowLocked')
          : (statusError ??
            (following ? i18n('cockpitFollowBackground') : i18n('cockpitFollowStopped')))
      }
    >
      <RadioTower
        {...stylex.props(styles.icon, Boolean(statusError) && styles.errorIcon)}
        size={13}
      />
      <span>{i18n('cockpitFollow')}</span>
      {locked && (
        <Lock className={`follow-control-lock ${stylex.props(styles.lock).className}`} size={11} />
      )}
      <Switch
        ariaLabel={i18n('cockpitFollowAria')}
        checked={following ?? false}
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
