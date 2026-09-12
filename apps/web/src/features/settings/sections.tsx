import type { ComponentType } from 'react';
import { BadgeCheck, Bot, Monitor, Plug, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { AiSettingsPane } from './AiSettingsPane';
import { AdvancedPane, ConnectionsPane, DisplayPane, LicensePane } from './panes';
import type { SettingsSectionId } from './types';
import { translate, type MessageKey } from '../../lib/i18n';

export interface SettingsSectionDef {
  id: SettingsSectionId;
  label: MessageKey;
  description: MessageKey;
  Icon: LucideIcon;
  Pane: ComponentType;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  {
    id: 'ai',
    label: 'aiModels',
    description: 'aiModelsDescription',
    Icon: Bot,
    Pane: AiSettingsPane,
  },
  {
    id: 'display',
    label: 'display',
    description: 'displayDescription',
    Icon: Monitor,
    Pane: DisplayPane,
  },
  {
    id: 'connections',
    label: 'connections',
    description: 'connectionsDescription',
    Icon: Plug,
    Pane: ConnectionsPane,
  },
  {
    id: 'license',
    label: 'license',
    description: 'licenseDescription',
    Icon: BadgeCheck,
    Pane: LicensePane,
  },
  {
    id: 'advanced',
    label: 'advanced',
    description: 'advancedDescription',
    Icon: SlidersHorizontal,
    Pane: AdvancedPane,
  },
];

export function findSettingsSection(id: string | undefined): SettingsSectionDef | null {
  return SETTINGS_SECTIONS.find((section) => section.id === id) ?? null;
}
