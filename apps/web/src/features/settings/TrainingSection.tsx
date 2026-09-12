import { useEffect, useState } from 'react';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { Switch } from '@web/ui';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { useLocale } from '../../lib/i18n';

export function TrainingSection() {
  const { t } = useLocale();
  const { pro, licensed } = useCapabilities();
  const available = pro === true && licensed && getTrainerBridge() !== null;
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!available) return;
    const bridge = getTrainerBridge();
    if (!bridge) return;
    let active = true;
    bridge
      .getFill()
      .then((result) => {
        if (active && result.ok) setEnabled(result.data.autoRefillEnabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [available]);

  if (!available || enabled === null) return null;

  const toggle = (next: boolean) => {
    setEnabled(next);
    void getTrainerBridge()
      ?.setAutoRefill({ enabled: next })
      .then((result) => {
        if (result.ok) setEnabled(result.data.autoRefillEnabled);
      })
      .catch(() => {});
  };

  return (
    <SettingsGroup name={t('training')}>
      <SettingsRow
        label={t('autoRefill')}
        description={t('autoRefillDescription')}
      >
        <Switch ariaLabel={t('autoRefill')} checked={enabled} onCheckedChange={toggle} />
      </SettingsRow>
    </SettingsGroup>
  );
}
