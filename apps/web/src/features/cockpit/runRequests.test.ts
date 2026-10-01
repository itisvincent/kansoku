import { afterEach, describe, expect, it } from 'vitest';
import { consumeRunRequest, noteRunRequested, resetRunRequestsForTests } from './runRequests';

afterEach(() => resetRunRequestsForTests());

describe('run requests', () => {
  it('reports a run the user asked for once, then forgets it', () => {
    noteRunRequested('mu.us', Date.parse('2026-09-30T14:00:00Z'));
    expect(consumeRunRequest('MU.US', '2026-09-30T14:10:00Z')).toBe(true);
    expect(consumeRunRequest('MU.US', '2026-09-30T14:20:00Z')).toBe(false);
  });

  it('ignores runs nobody asked for, like a background scan', () => {
    expect(consumeRunRequest('NVDA.US', '2026-09-30T14:10:00Z')).toBe(false);
  });

  it('does not count a request made after the run ended', () => {
    noteRunRequested('MU.US', Date.parse('2026-09-30T14:30:00Z'));
    expect(consumeRunRequest('MU.US', '2026-09-30T14:10:00Z')).toBe(false);
  });
});
