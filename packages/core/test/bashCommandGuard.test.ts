import { describe, expect, it } from 'vitest';
import { isRejectedCommand } from '../src/ai/agents/agentTools/execTool.js';

describe('isRejectedCommand', () => {
  it.each([
    'longbridge quote NVDA.US --format json 2>&1 | head -5',
    'cat stocks/MU.md 2>/dev/null || echo none',
    "rg -n 'x' journal | head",
    'git log --oneline -3',
    'find . -name "*.md" | head',
    'python3 .claude/skills/fred/scripts/series.py --id CPIAUCSL --json',
  ])('allows the read-only command %s', (command) => {
    expect(isRejectedCommand(command)).toBe(false);
  });

  it.each([
    'echo hi > out.txt',
    'echo hi 2> err.txt',
    'echo hi >> journal/x.md',
    "sed -i 's/a/b/' journal/x.md",
    "perl -pi -e 's/a/b/' journal/x.md",
    "python3 -c \"open('journal/x.md','w').write('')\"",
    'python3 -c "import os; os.remove(\'journal/x.md\')"',
    "node -e \"require('fs').writeFileSync('x','')\"",
    'git checkout -- journal',
    'git reset --hard',
    'find journal -name "*.md" -delete',
    'find journal -exec rm {} ;',
    'curl -o x https://example.com',
    'wget https://example.com',
    'truncate -s 0 journal/x.md',
    'dd if=/dev/zero of=journal/x.md',
    'rm -rf journal',
  ])('blocks the writing command %s', (command) => {
    expect(isRejectedCommand(command)).toBe(true);
  });
});
