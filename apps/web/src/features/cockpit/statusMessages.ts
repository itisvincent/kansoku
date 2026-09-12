import { translate, type Locale, type MessageKey } from '@web/lib/i18n';

// Keep local status codes in asynchronous state; translate when presenting it.
// Provider errors and user-authored text pass through unchanged.
const STATUS_MESSAGES: Readonly<Record<string, MessageKey>> = {
  'local:cockpitStartFailed': 'cockpitStartFailed',
  'local:cockpitAwaitingServer': 'cockpitAwaitingServer',
  'local:cockpitPositionRetry': 'cockpitPositionRetry',
  'local:cockpitBenchmarkRetry': 'cockpitBenchmarkRetry',
  'local:cockpitDeepDirty': 'cockpitDeepDirty',
  'local:cockpitDeepComplete': 'cockpitDeepComplete',
  'local:cockpitDeepFailed': 'cockpitDeepFailed',
  'local:cockpitDeepBusy': 'cockpitDeepBusy',
  'local:cockpitDeepUnconfigured': 'cockpitDeepUnconfigured',
  'local:cockpitExplainUnconfigured': 'cockpitExplainUnconfigured',
  'local:cockpitExplainBusy': 'cockpitExplainBusy',
  'local:cockpitExplainFailed': 'cockpitExplainFailed',
  'local:cockpitAnalystUnconfigured': 'cockpitAnalystUnconfigured',
  'local:cockpitAnalystBusy': 'cockpitAnalystBusy',
  'local:cockpitAnalystCooldown': 'cockpitAnalystCooldown',
  'local:cockpitCancelled': 'cockpitCancelled',
  'local:chatHistoryLoadFailed': 'chatHistoryLoadFailed',
  'local:chatEmptyMessage': 'chatEmptyMessage',
  'local:chatSessionMissing': 'chatSessionMissing',
  'local:chatNothingToRetry': 'chatNothingToRetry',
};

export function localizeStatusMessage(value: string, locale: Locale): string;
export function localizeStatusMessage(value: string | null, locale: Locale): string | null;
export function localizeStatusMessage(value: string | null, locale: Locale): string | null {
  if (value === null) return null;
  return Object.prototype.hasOwnProperty.call(STATUS_MESSAGES, value)
    ? translate(locale, STATUS_MESSAGES[value])
    : value;
}
