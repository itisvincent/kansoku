import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipsInApp, usMarketOpen } from './release.mjs';

test('the US regular session counts as open, in New York time', () => {
  // 2026-10-09 is a Friday; New York is UTC-4 in October.
  assert.equal(usMarketOpen(new Date('2026-10-09T13:29:00Z')), false);
  assert.equal(usMarketOpen(new Date('2026-10-09T13:30:00Z')), true);
  assert.equal(usMarketOpen(new Date('2026-10-09T19:59:00Z')), true);
  assert.equal(usMarketOpen(new Date('2026-10-09T20:00:00Z')), false);
  // Taiwan morning, before anyone is trading.
  assert.equal(usMarketOpen(new Date('2026-10-12T00:30:00Z')), false);
});

test('weekends are closed', () => {
  assert.equal(usMarketOpen(new Date('2026-10-10T15:00:00Z')), false);
  assert.equal(usMarketOpen(new Date('2026-10-11T15:00:00Z')), false);
});

test('only changes that end up in the app trigger a release', () => {
  for (const path of [
    'apps/web/src/features/desktop/tabsController.ts',
    'apps/desktop/src/main.ts',
    'packages/core/src/ai/chat/chat.ts',
    '.claude/skills/trade-gate/SKILL.md',
    'packages/core/skills/canvas/SKILL.md',
  ]) {
    assert.equal(shipsInApp(path), true, path);
  }
  for (const path of [
    'apps/web/src/lib/symbol.test.ts',
    'packages/core/test/skillsAudit.test.ts',
    'packages/core/test/__snapshots__/skillsAudit.test.ts.snap',
    'apps/desktop/scripts/__tests__/stageAgentKit.spec.mjs',
    'scripts/agent/queue.mjs',
    '.github/workflows/ci.yml',
    'docs/agent/notes.md',
    'apps/web/README.md',
    'pnpm-lock.yaml',
    'apps/server/src/main.ts',
  ]) {
    assert.equal(shipsInApp(path), false, path);
  }
});
