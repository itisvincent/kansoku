import { isDesktopRealtime } from '@web/lib/portTransport';
import { NoteBlock } from '@web/ui';
import { AgentKitSection } from './AgentKitSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { LicenseSection } from './LicenseSection';
import { LongbridgeSection } from './LongbridgeSection';
import { OpencliSection } from './OpencliSection';
import { TimeDisplaySettingsCard } from './TimeDisplaySettingsCard';
import { TrainingSection } from './TrainingSection';
import { WatchedMarketsCard } from './WatchedMarketsCard';
import { WebSearchSection } from './WebSearchSection';
import { WorkspaceSection } from './WorkspaceSection';
import type { SettingsSectionId } from './types';
import { useProComposition } from '../edition/useProComposition';
import { useLocale } from '../../lib/i18n';

function ProSections({ section }: { section: SettingsSectionId }) {
  const pro = useProComposition();
  const entries = pro.status === 'ready' ? (pro.composition?.settingsSections ?? []) : [];
  return entries
    .filter((entry) => entry.section === section)
    .map(({ id, Component }) => <Component key={id} />);
}

export function DisplayPane() {
  const { locale, setLocale, t } = useLocale();
  return (
    <>
      <section className="settings-group">
        <h2>{t('language')}</h2>
        <p>{t('languageDescription')}</p>
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value as 'zh-CN' | 'en-US')}
        >
          <option value="en-US">{t('english')}</option>
          <option value="zh-CN">{t('chinese')}</option>
        </select>
      </section>
      <TimeDisplaySettingsCard />
      <WatchedMarketsCard />
      <ProSections section="display" />
    </>
  );
}

export function ConnectionsPane() {
  const { t } = useLocale();
  if (!isDesktopRealtime()) return <NoteBlock>{t('desktopOnlySettings')}</NoteBlock>;
  return (
    <>
      <LongbridgeSection />
      <OpencliSection />
      <WebSearchSection />
      <WorkspaceSection />
      <ProSections section="connections" />
    </>
  );
}

export function LicensePane() {
  return (
    <>
      <LicenseSection />
      <ProSections section="license" />
    </>
  );
}

export function AdvancedPane() {
  const { t } = useLocale();
  if (!isDesktopRealtime()) return <NoteBlock>{t('desktopOnlySettings')}</NoteBlock>;
  return (
    <>
      <AgentKitSection />
      <TrainingSection />
      <DiagnosticsSection />
      <ProSections section="advanced" />
    </>
  );
}
