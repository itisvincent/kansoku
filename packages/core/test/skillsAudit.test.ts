import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditSkills } from '../src/ai/agents/skillsAudit.js';
import { loadSkillIndex } from '../src/ai/agents/skills.js';
import { PROJECT_ROOT, skillSearchDirs } from '../src/platform/env.js';

const audit = auditSkills(PROJECT_ROOT);

// Skills kept out of git (member-only material, personal installs) exist on one machine only,
// so they are left out of the snapshot and only checked where they are installed.
function isLocalOnly(root: string, name: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', join(root, name)], { cwd: PROJECT_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('skills audit', () => {
  // Only app-visible rows are snapshotted. The agent-only list is a short reviewed file already,
  // and one of its entries (`acceptance`) is installed locally but absent on CI, so including
  // them would make the snapshot machine-dependent.
  it('matches the recorded app-visible skill set', () => {
    const visible = audit.rows
      .filter((row) => row.appVisible && !isLocalOnly(row.root, row.name))
      .map(
        (row) =>
          `${row.name} @ ${row.root}${row.appChapters.length ? ` +${row.appChapters.join(',')}` : ''}`,
      );
    expect(visible).toMatchSnapshot();
  });

  it('never exposes an agent-only skill to the app', () => {
    const leaked = audit.rows.filter((row) => !row.appVisible && row.appVisible !== false);
    expect(leaked).toEqual([]);
    const index = loadSkillIndex(skillSearchDirs(PROJECT_ROOT), {
      repoRoot: PROJECT_ROOT,
      runtime: 'app',
    });
    const names = new Set(index.map((skill) => skill.name));
    for (const row of audit.rows.filter((r) => !r.appVisible)) {
      expect(names.has(row.name)).toBe(false);
    }
  });

  // These five are named by app code, not discovered by the model. Mis-filing one into agentOnly
  // or moving its directory turns into a runtime failure (DisciplineMissingError) or a silently
  // weaker agent, so the boundary is asserted here instead.
  it.for([
    'trading-discipline',
    'intraday-signal',
    'eps-pe-scenario-stock-analysis',
    'stock-deep-dive',
    'korea-market',
    'twitter-reader',
  ])('keeps %s reachable from the app runtime', (name, { skip }) => {
    const index = loadSkillIndex(skillSearchDirs(PROJECT_ROOT), {
      repoRoot: PROJECT_ROOT,
      runtime: 'app',
    });
    const found = index.find((skill) => skill.name === name);
    if (!found && isLocalOnly('.claude/skills', name)) skip();
    expect(found).toBeDefined();
  });

  it('reports agentOnly entries whose directory is gone', () => {
    // Not a failure: `acceptance` is installed locally but is neither tracked nor locked, so it is
    // legitimately absent on CI. The audit surfaces the list; it does not gate on it.
    expect(Array.isArray(audit.staleAgentOnly)).toBe(true);
  });
});
