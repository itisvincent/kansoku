import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { launchSpec, resolveWindowsCommand } from '../src/platform/windowsLaunch.js';
import { codexAdapterSpec, createCliAgentAdapter } from '../src/ai/websearch/adapters/cliAgent.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Windows command launching', () => {
  // Looks up real files with Windows paths, so it only means something on Windows.
  it.skipIf(process.platform !== 'win32')('finds an npm .cmd launcher on PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'win-launch-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'codex.cmd'), '@echo off');
    expect(resolveWindowsCommand('codex', { PATH: dir, PATHEXT: '.EXE;.CMD' })).toBe(
      join(dir, 'codex.cmd'),
    );
    expect(resolveWindowsCommand('missing', { PATH: dir, PATHEXT: '.EXE;.CMD' })).toBeNull();
  });

  it('runs a .cmd through cmd.exe with every part quoted', () => {
    const spec = launchSpec('C:\Program Files\tools\opencli.cmd', ['twitter', 'profile'], {
      ComSpec: 'C:\Windows\system32\cmd.exe',
    });
    expect(spec.file).toBe('C:\Windows\system32\cmd.exe');
    expect(spec.args).toEqual([
      '/d',
      '/s',
      '/c',
      '""C:\Program Files\tools\opencli.cmd" "twitter" "profile""',
    ]);
    expect(spec.windowsVerbatimArguments).toBe(true);
  });

  it('spawns a real executable directly', () => {
    expect(launchSpec('C:\bin\rg.exe', ['-n', 'x'])).toEqual({
      file: 'C:\bin\rg.exe',
      args: ['-n', 'x'],
    });
  });

  it('refuses text cmd.exe would mangle, so callers send it through stdin', () => {
    expect(() => launchSpec('a.cmd', ['line one\nline two'])).toThrow(/stdin/);
    expect(() => launchSpec('a.cmd', ['100%'])).toThrow(/stdin/);
  });
});

describe('codex web search', () => {
  it('sends the multi-line prompt through stdin and passes "-" in its place', async () => {
    const calls: Array<{ args: string[]; input?: string }> = [];
    const adapter = createCliAgentAdapter(codexAdapterSpec, async (_bin, args, opts) => {
      calls.push({ args, input: opts.input });
      return { stdout: '' };
    });
    await adapter.search({ query: 'MU earnings', timeoutMs: 1000 }).catch(() => {});
    const search = calls.find((c) => c.args[0] === 'exec')!;
    expect(search.args.at(-1)).toBe('-');
    expect(search.input).toContain('Request:\nMU earnings');
  });
});
