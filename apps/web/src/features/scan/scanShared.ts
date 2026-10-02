import type { ScanItem, ScanStartResult } from '@kansoku/shared/types';
import type { MessageKey } from '@web/lib/i18n';
import type { ChartTf } from '../charts/intraday/timeframes';
import { ANCHOR_CHOICE_KEY } from '../cockpit/AnalysisTab';

/** Why a scan did not start, in words; shared by the Scan page and the home button. */
export const SCAN_REASON_TEXT: Record<
  Exclude<ScanStartResult, { started: true }>['reason'],
  MessageKey
> = {
  'busy': 'scanReasonBusy',
  'analyst layer disabled': 'scanReasonUnconfigured',
  'empty watchlist': 'scanReasonEmpty',
  'watchlist unavailable': 'scanReasonUnavailable',
  'no positions': 'scanReasonNoPositions',
  'positions unavailable': 'scanReasonPositionsUnavailable',
  'nothing to rerun': 'scanReasonNothingToRerun',
};

/** What "Re-run failed" picks up; matches the scanner's own rule. */
const RERUNNABLE: ReadonlySet<ScanItem['status']> = new Set(['failed', 'skipped', 'cancelled']);

export function countRerunnable(items: readonly ScanItem[]): number {
  return items.filter((item) => RERUNNABLE.has(item.status)).length;
}

/** The anchor pinned in the Analysis tab, when it is one of the scan's windows. */
export function readPinnedAnchor(windows: readonly ChartTf[]): ChartTf | undefined {
  try {
    const choice = localStorage.getItem(ANCHOR_CHOICE_KEY);
    return windows.find((tf) => tf === choice);
  } catch {
    return undefined;
  }
}
