import type { MessageKey } from '@web/lib/i18n';

export const DIRECTION_LABEL: Record<string, MessageKey> = {
  long: 'chartLong',
  short: 'chartShort',
  neutral: 'chartNeutral',
};

const DIRECTION_TONE: Record<string, 'up' | 'down'> = { long: 'up', short: 'down' };

export function directionTone(direction: string | null | undefined): 'up' | 'down' | undefined {
  return direction ? DIRECTION_TONE[direction] : undefined;
}
