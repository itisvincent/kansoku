import * as stylex from '@stylexjs/stylex';
import { SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { ROLE_LABEL, type Role, type RoleMode } from './types';
import { useLocale } from '../../lib/i18n';

const styles = stylex.create({
  root: {
    'width': '236px',
    'gridTemplateColumns': '1.35fr 1fr 0.75fr',
    '@media (max-width: 560px)': { width: 'min(100%, 260px)' },
  },
});

export function RoleModeControl({
  role,
  value,
  onChange,
}: {
  role: Role;
  value: RoleMode;
  onChange: (mode: RoleMode) => void;
}) {
  const { t } = useLocale();
  const modeOptions = [
    { value: 'inherit', label: t('followPrimary') },
    { value: 'custom', label: t('custom') },
    { value: 'disabled', label: t('disabled') },
  ] satisfies readonly SegmentedControlOption<RoleMode>[];
  return (
    <SegmentedControl
      ariaLabel={`${t('roleAssignment')} ${ROLE_LABEL[role]}`}
      className={stylex.props(styles.root).className}
      value={value}
      options={modeOptions}
      onChange={onChange}
    />
  );
}
