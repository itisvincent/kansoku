import type { ProHooks } from '@kansoku/pro-api';

export const freeHooks: ProHooks = {
  requestImmediateFollow() {},
  startDeepDiveForNote() {
    return { started: false, reason: 'disabled' };
  },
  deepDiveStatus() {
    return { running: false };
  },
};

let activeHooks: ProHooks = freeHooks;

export function registerProHooks(hooks: ProHooks): void {
  activeHooks = hooks;
}

export function resetProHooksForTests(): void {
  activeHooks = freeHooks;
}

export function currentProHooks(): ProHooks {
  return activeHooks;
}

/**
 * True only when a Pro composition supplied its own hooks. A composition can be present
 * without them (the local test build fills the Pro slot with community detectors only),
 * and then open core's own implementations must run instead of the stubs.
 */
export function hasProHooks(): boolean {
  return activeHooks !== freeHooks;
}
