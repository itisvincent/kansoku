import { useLocale } from '@web/lib/i18n';
import { getDesktopCredentialsBridge } from '../settings/desktopCredentials';
import { dismissRestrictedBanner, useRestrictedMode } from './restrictedMode';
import { navigate } from '../../lib/router';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    alignItems: 'center',
    backgroundColor: colors.backgroundElement,
    borderBottomColor: colors.down,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    color: colors.down,
    display: 'flex',
    fontSize: fontSizes.base,
    gap: '12px',
    justifyContent: 'space-between',
    padding: '8px 16px',
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    gap: '10px',
  },
  link: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    color: colors.accent,
    cursor: 'pointer',
    fontSize: fontSizes.base,
    padding: 0,
  },
  dismiss: {
    ':hover': { color: colors.textPrimary },
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'fontSize': fontSizes.base,
    'padding': '0 4px',
  },
});

export function RestrictedBanner() {
  const { t: tr } = useLocale();
  const { restricted, dismissed } = useRestrictedMode();
  if (!restricted || dismissed) return null;

  const canConfigure = getDesktopCredentialsBridge() !== null;

  return (
    <div {...stylex.props(styles.root)}>
      <span>{tr('marketCredentialsMissing')}</span>
      <div {...stylex.props(styles.actions)}>
        {canConfigure && (
          <button {...stylex.props(styles.link)} onClick={() => navigate('/settings/license')}>
            {tr('uiGoSettings')}
          </button>
        )}
        <button
          {...stylex.props(styles.dismiss)}
          onClick={dismissRestrictedBanner}
          aria-label={tr('uiClose')}
        >
          ×
        </button>
      </div>
    </div>
  );
}
