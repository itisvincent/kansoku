import { translate, type Locale, type MessageKey } from '../../lib/i18n';
import type { TrainerCaseTag } from '@kansoku/pro-api';

const CASE_TAG_KEYS: Record<TrainerCaseTag, MessageKey> = {
  'trend-follow': 'caseTrendFollow',
  'pullback-entry': 'casePullbackEntry',
  'false-breakout': 'caseFalseBreakout',
  'top-reversal': 'caseTopReversal',
  'range-bound': 'caseRangeBound',
};

export function trainerCaseTagLabel(tag: TrainerCaseTag, locale: Locale = 'zh-CN'): string {
  return translate(locale, CASE_TAG_KEYS[tag]);
}
