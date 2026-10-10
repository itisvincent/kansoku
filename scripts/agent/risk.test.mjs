import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, globToRegExp, isReleaseChange } from './risk.mjs';

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const file = (path, lines = 10) => ({ path, additions: lines, deletions: 0 });

test('globs match folders at any depth and single names', () => {
  assert.ok(globToRegExp('packages/core/src/ai/**').test('packages/core/src/ai/chat/chat.ts'));
  assert.ok(globToRegExp('**/.env*').test('.env'));
  assert.ok(globToRegExp('**/.env*').test('apps/web/.env.local'));
  assert.ok(!globToRegExp('package.json').test('apps/web/package.json'));
  assert.ok(!globToRegExp('apps/desktop/src/**').test('apps/desktop/test/x.ts'));
});

test('chart and UI work merges itself', () => {
  const result = classify(
    [
      file('apps/web/src/features/desktop/tabsController.ts'),
      file('apps/web/src/features/desktop/tabsController.test.tsx'),
      file('docs/agent/notes.md'),
    ],
    config,
  );
  assert.deepEqual(result, { level: 'low', reasons: [] });
});

test('broker data, AI costs, Pro types and the agent rules wait for the owner', () => {
  for (const path of [
    'packages/core/src/marketdata/futu/futuAccount.ts',
    'packages/core/src/ai/chat/chat.ts',
    'packages/pro-api/src/aiTypes.ts',
    'scripts/agent/risk.mjs',
    '.claude/skills/trade-gate/SKILL.md',
    'apps/desktop/src/shell/tabs/store.ts',
    'pnpm-lock.yaml',
    '.github/workflows/ci.yml',
  ]) {
    const result = classify([file('apps/web/src/a.ts'), file(path)], config);
    assert.equal(result.level, 'needs-you', path);
    assert.equal(result.reasons.length, 1, path);
  }
});

test('a large change waits for the owner even in a safe area', () => {
  const result = classify([file('apps/web/src/a.ts', 400), file('apps/web/src/b.ts', 300)], config);
  assert.equal(result.level, 'needs-you');
  assert.match(result.reasons[0], /700 changed lines/);
});

test('an empty PR never merges itself', () => {
  assert.equal(classify([], config).level, 'needs-you');
});

test('a release PR merges on checks alone only when it just bumps the version', () => {
  const pkg = (patch, additions = 1, deletions = 1) => ({
    filename: 'apps/desktop/package.json',
    additions,
    deletions,
    patch,
  });
  const log = { filename: 'apps/desktop/CHANGELOG.md', additions: 5, deletions: 0, patch: '' };
  const bump =
    '@@ -2,7 +2,7 @@\n   "name": "@kansoku/desktop",\n-  "version": "0.43.56",\n+  "version": "0.43.57",\n   "private": true,';
  assert.equal(isReleaseChange('agent/release-0.43.57', [pkg(bump), log]), true);
  assert.equal(isReleaseChange('agent/7-x', [pkg(bump), log]), false);
  const sneaky = '@@ -20,7 +20,7 @@\n-    "electron": "39.0.0",\n+    "electron": "39.0.1",';
  assert.equal(isReleaseChange('agent/release-0.43.57', [pkg(sneaky), log]), false);
  assert.equal(
    isReleaseChange('agent/release-0.43.57', [pkg(bump), { ...log, deletions: 3 }]),
    false,
  );
  assert.equal(
    isReleaseChange('agent/release-0.43.57', [
      pkg(bump),
      log,
      { filename: 'apps/web/src/a.ts', additions: 1, deletions: 0 },
    ]),
    false,
  );
});
