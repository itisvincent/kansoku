import { translate, type Locale, type MessageKey, type MessageParams } from '../../lib/i18n';
import {
  roleLabel,
  ROLES,
  thinkingLabel,
  type AiSettings,
  type Catalog,
  type Role,
  type RoleSetting,
  type RoleUsage,
  type UsageToday,
} from './types';

type SettingsIssueTone = 'warning' | 'error';

interface SettingsIssue {
  id: string;
  title: string;
  detail: string;
  targetId: string;
  tone: SettingsIssueTone;
  priority: number;
}

export interface RoleView {
  effectiveLabel: string;
  tone: 'default' | 'muted' | 'warning' | 'error';
  usageLabel: string;
}

export interface SettingsViewModel {
  summary: {
    statusLabel: string;
    statusTone: 'up' | 'accent' | 'down';
    enabledLabel: string;
    usageLabel: string | null;
  };
  roles: Record<Role, RoleView>;
  issues: SettingsIssue[];
}

export function deriveSettingsViewModel(input: {
  settings: AiSettings;
  catalog: Catalog;
  usage: UsageToday | null;
  roles: AiSettings['roles'];
  locale?: Locale;
}): SettingsViewModel {
  const locale = input.locale ?? 'zh-CN';
  const t = (key: MessageKey, params?: MessageParams) => translate(locale, key, params);
  const roleList = (roles: Role[]) =>
    roles.map((role) => roleLabel(role, locale)).join(locale === 'zh-CN' ? '、' : ', ');
  const formatUsage = (usage: RoleUsage | undefined): string =>
    t('todayUsage', {
      value:
        !usage || (!usage.calls && !usage.cost)
          ? '—'
          : t('usageCostCalls', { cost: usage.cost.toFixed(2), count: usage.calls }),
    });
  const providers = new Map(input.catalog.providers.map((provider) => [provider.id, provider]));
  const issues: SettingsIssue[] = [];
  const missingPrimaryRoles: Role[] = [];
  const stalePrimaryRoles: Role[] = [];
  const authRoles = new Map<string, Role[]>();
  const roleViews = {} as Record<Role, RoleView>;

  if (input.settings.masterKey === 'invalid') {
    issues.push({
      id: 'master-key-invalid',
      title: t('masterKeyInvalid'),
      detail: t('masterKeyInvalidHint'),
      targetId: 'settings-provider-panel',
      tone: 'error',
      priority: 0,
    });
  }

  const validateSetting = (role: Role, setting: RoleSetting, inherited: boolean): RoleView => {
    const provider = setting.provider ? providers.get(setting.provider) : undefined;
    const model = provider?.models.find((entry) => entry.id === setting.modelId);
    const thinkingValid = Boolean(
      setting.thinkingLevel && model?.thinkingLevels.includes(setting.thinkingLevel),
    );

    if (setting.stale || !provider || !model || !thinkingValid) {
      if (inherited) {
        stalePrimaryRoles.push(role);
      } else {
        issues.push({
          id: `stale-model-` + role,
          title: t('roleModelStale', { role: roleLabel(role, locale) }),
          detail: t('staleModelHint'),
          targetId: `settings-role-` + role,
          tone: 'warning',
          priority: 1,
        });
      }
      return {
        effectiveLabel: t('modelUnavailable'),
        tone: 'warning',
        usageLabel: formatUsage(input.usage?.roles[role]),
      };
    }

    if (provider.auth.status !== 'configured') {
      const usedBy = authRoles.get(provider.id) ?? [];
      if (!usedBy.includes(role)) usedBy.push(role);
      authRoles.set(provider.id, usedBy);
      return {
        effectiveLabel: t('rolePausedNoAuth', { provider: provider.name }),
        tone: provider.auth.status === 'error' ? 'error' : 'warning',
        usageLabel: formatUsage(input.usage?.roles[role]),
      };
    }

    return {
      effectiveLabel: model.name + ' · ' + thinkingLabel(setting.thinkingLevel, locale),
      tone: 'default',
      usageLabel: formatUsage(input.usage?.roles[role]),
    };
  };

  for (const role of ROLES) {
    const setting = input.roles[role];
    if (setting.mode === 'disabled') {
      roleViews[role] = {
        effectiveLabel: t('roleDisabledHint'),
        tone: 'muted',
        usageLabel: formatUsage(input.usage?.roles[role]),
      };
      continue;
    }

    if (setting.mode === 'inherit') {
      const primary = input.roles.primary;
      if (
        primary.mode !== 'custom' ||
        !primary.provider ||
        !primary.modelId ||
        !primary.thinkingLevel
      ) {
        missingPrimaryRoles.push(role);
        roleViews[role] = {
          effectiveLabel: t('rolePausedNoPrimary'),
          tone: 'warning',
          usageLabel: formatUsage(input.usage?.roles[role]),
        };
      } else {
        roleViews[role] = validateSetting(role, primary, true);
      }
      continue;
    }

    roleViews[role] = validateSetting(role, setting, false);
  }

  if (stalePrimaryRoles.length > 0) {
    issues.push({
      id: 'stale-model-primary',
      title: t('primaryStale'),
      detail: t('rolesFollowPrimary', { roles: roleList(stalePrimaryRoles) }),
      targetId: 'settings-role-primary',
      tone: 'warning',
      priority: 1,
    });
  }

  for (const [providerId, roles] of authRoles) {
    const provider = providers.get(providerId);
    if (!provider) continue;
    const authError = provider.auth.status === 'error';
    const skipForInvalidMasterKey =
      input.settings.masterKey === 'invalid' && provider.auth.kind === 'api_key';
    if (skipForInvalidMasterKey) continue;
    issues.push({
      id: (authError ? 'auth-error-' : 'missing-auth-') + providerId,
      title: t(authError ? 'providerAuthError' : 'providerAuthUnset', { provider: provider.name }),
      detail: t('rolesUseProvider', { roles: roleList(roles) }),
      targetId: `settings-provider-` + providerId,
      tone: authError ? 'error' : 'warning',
      priority: 2,
    });
  }

  if (missingPrimaryRoles.length > 0) {
    issues.push({
      id: 'missing-primary',
      title: t('primaryMissing'),
      detail: t('rolesFollowPrimary', { roles: roleList(missingPrimaryRoles) }),
      targetId: 'settings-role-primary',
      tone: 'warning',
      priority: 3,
    });
  }

  issues.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

  const enabledCount = ROLES.filter((role) => input.roles[role].mode !== 'disabled').length;

  return {
    summary: {
      statusLabel:
        issues.length === 0
          ? t('settingsComplete')
          : t('settingsIssueCount', { count: issues.length }),
      statusTone: issues.some((issue) => issue.tone === 'error')
        ? 'down'
        : issues.length
          ? 'accent'
          : 'up',
      enabledLabel: t('enabledRoleCount', { enabled: enabledCount, total: ROLES.length }),
      usageLabel: input.usage
        ? t('usageCostCalls', {
            cost: input.usage.total.cost.toFixed(2),
            count: input.usage.total.calls,
          })
        : null,
    },
    roles: roleViews,
    issues,
  };
}
