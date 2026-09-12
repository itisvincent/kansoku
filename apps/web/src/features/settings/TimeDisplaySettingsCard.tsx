import { localTimeZone } from '@kansoku/shared/time';
import * as stylex from '@stylexjs/stylex';
import {
  setTimeDisplayPreference,
  useTimeDisplayPreference,
  type TimeDisplayPreference,
} from '@web/lib/timeDisplayPreference';
import { SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { useLocale } from '../../lib/i18n';

const OPTIONS = [
  { value: 'market', label: '美东时间' },
  { value: 'local', label: '本地时间' },
] satisfies readonly SegmentedControlOption<TimeDisplayPreference>[];

const styles = stylex.create({
  mode: {
    'width': '168px',
    'flex': '0 0 auto',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 560px)': { width: '100%' },
  },
});

export function TimeDisplaySettingsCard() {
  const { t } = useLocale();
  const preference = useTimeDisplayPreference();
  const options = [
    { value: 'market', label: t('marketTime') },
    { value: 'local', label: t('localTime') },
  ] satisfies readonly SegmentedControlOption<TimeDisplayPreference>[];

  return (
    <SettingsGroup name={t('timeDisplay')}>
      <SettingsRow
        label={t('preferredTime')}
        description={`${t('localTimezone')} ${localTimeZone()}`}
      >
        <SegmentedControl
          ariaLabel={t('preferredTime')}
          className={stylex.props(styles.mode).className}
          value={preference}
          options={options}
          onChange={setTimeDisplayPreference}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
