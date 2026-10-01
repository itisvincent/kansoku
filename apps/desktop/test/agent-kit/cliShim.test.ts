import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installCliShim } from '../../src/agent-kit/cliShim.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('installCliShim on Windows', () => {
  it('writes Git Bash and Command Prompt launchers instead of a file symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kansoku-cli-shim-'));
    dirs.push(dir);
    const cliShim = join(dir, 'kansoku-cli');
    installCliShim({
      cliShim,
      resourcesPath: 'C:\\Program Files\\Kansoku\\resources',
      platform: 'win32',
      execPath: 'C:\\Program Files\\Kansoku\\Kansoku.exe',
    });

    const sh = readFileSync(cliShim, 'utf8');
    expect(sh.startsWith('#!/bin/sh')).toBe(true);
    expect(sh).toContain(
      'ELECTRON_RUN_AS_NODE=1 exec "C:/Program Files/Kansoku/Kansoku.exe" "C:/Program Files/Kansoku/resources/kansoku-agent-kit/cli.js" "$@"',
    );

    const cmd = readFileSync(`${cliShim}.cmd`, 'utf8');
    expect(cmd).toContain('set ELECTRON_RUN_AS_NODE=1');
    expect(cmd).toContain('"C:\\Program Files\\Kansoku\\Kansoku.exe"');
    expect(cmd).toContain('%*');
  });
});
