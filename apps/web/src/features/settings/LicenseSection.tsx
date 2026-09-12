import { LicensePanel } from './LicensePanel';
import { SettingsGroup } from './SettingsGroup';
import { useLocale } from '../../lib/i18n';

export function LicenseSection() {
  const { t } = useLocale();
  return (
    <SettingsGroup name={t('localLicense')}>
      <LicensePanel />
    </SettingsGroup>
  );
}
