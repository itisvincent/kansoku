import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from './guard.mjs';

const bash = (command) => decide({ tool_name: 'Bash', tool_input: { command } });
const ps = (command) => decide({ tool_name: 'PowerShell', tool_input: { command } });
const write = (file_path) =>
  decide({ tool_name: 'Write', tool_input: { file_path, content: 'x' } });

test('normal work goes through', () => {
  for (const command of [
    'git status',
    'git add -A && git commit -m "fix: tabs"',
    'git checkout -b agent/12-one-tab-per-stock',
    'pnpm --filter @kansoku/web exec vitest run src/features/desktop',
    'npx tsc --noEmit -p apps/web',
    'gh pr view 12 --repo itisvincent/kansoku --json files',
    'gh issue list --repo itisvincent/kansoku',
    'node scripts/agent/queue.mjs status',
    'node E:/Workspace/programming/javascript/kansoku-agent/scripts/agent/queue.mjs open-pr --issue 3 --title x --body-file b.md',
    'cd apps/web && npx vitest run',
    'cat .claude/skills/trade-gate/SKILL.md',
    'cp .env.example /tmp/x',
  ]) {
    assert.equal(bash(command), null, command);
  }
  assert.equal(write('E:/w/kansoku-agent/apps/web/src/a.ts'), null);
});

test('pushing, merging and GitHub writes only go through the queue tool', () => {
  assert.match(bash('git push origin agent/3-x'), /open-pr/);
  assert.match(bash('git push --force'), /open-pr/);
  assert.match(bash('git status && git push'), /open-pr/);
  assert.match(bash('gh pr merge 12 --squash'), /queue\.mjs/);
  assert.match(bash('gh pr create --base main'), /queue\.mjs/);
  assert.match(bash('gh api repos/itisvincent/kansoku/issues -f title=x'), /queue\.mjs/);
  assert.match(bash('gh issue edit 3 --add-label agent-ready'), /queue\.mjs/);
  assert.match(bash('node scripts/agent/queue.mjs status; gh pr merge 3'), /queue\.mjs/);
  assert.match(
    bash(`node -e "require('child_process').execSync('git push origin HEAD')"`),
    /queue\.mjs/,
  );
  assert.match(ps("Invoke-Expression 'gh pr merge 3 --squash'"), /queue\.mjs/);
  assert.match(bash('bash -c "gh api -X DELETE repos/itisvincent/kansoku"'), /queue\.mjs/);
});

test('the upstream project is off limits', () => {
  assert.match(bash('gh pr view 1 --repo kansoku-trade/kansoku'), /upstream/);
  assert.match(bash('git fetch https://github.com/kansoku-trade/kansoku'), /upstream/);
});

test('secrets, broker, trading, the installed app and paid AI runs are refused', () => {
  assert.match(bash('cat .env'), /\.env/);
  assert.match(bash('type apps\\web\\.env.local'), /\.env/);
  assert.match(
    decide({ tool_name: 'Read', tool_input: { file_path: 'E:/x/kansoku/.env' } }),
    /\.env/,
  );
  assert.match(bash('longbridge quote AVGO.US'), /broker/);
  assert.match(bash('node -e "placeOrder()"'), /trading/);
  assert.match(
    ps("Get-Process | Where-Object { $_.Path -like 'D:\\tools\\kansoku\\*' } | Stop-Process"),
    /installed app|stop processes/,
  );
  assert.match(bash('curl http://127.0.0.1:9336/json/list'), /installed app/);
  assert.match(bash('claude -p "analyze AVGO"'), /paid AI/);
  assert.match(write('D:\\tools\\kansoku\\resources\\app.asar'), /installed app/);
});

test('the agent cannot rewrite its own rules', () => {
  assert.match(write('E:/w/kansoku-agent/scripts/agent/config.json'), /own rules/);
  assert.match(write('E:/w/kansoku-agent/.claude/settings.local.json'), /own rules/);
  assert.match(write('E:/w/kansoku-agent/.env'), /\.env|own rules/);
  assert.match(bash("sed -i 's/needs-you//' scripts/agent/config.json"), /own rules/);
  assert.match(bash('echo {} > .claude/settings.local.json'), /own rules/);
  assert.match(bash('git remote set-url origin https://example.com/x.git'), /remotes/);
});

test('garbage input is refused', () => {
  assert.equal(decide({}), 'unreadable hook input');
  assert.equal(decide({ tool_name: 'Bash', tool_input: {} }), 'unreadable command');
});

test('as a hook it prints a deny decision and exits 0', () => {
  const script = fileURLToPath(new URL('./guard.mjs', import.meta.url));
  const deny = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' } }),
    encoding: 'utf8',
  });
  assert.equal(deny.status, 0);
  const out = JSON.parse(deny.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  const allow = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }),
    encoding: 'utf8',
  });
  assert.equal(allow.status, 0);
  assert.equal(allow.stdout, '');
  const broken = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8' });
  assert.equal(JSON.parse(broken.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
