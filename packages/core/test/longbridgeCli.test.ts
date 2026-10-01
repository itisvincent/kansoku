import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  locateLongbridgeCli,
  LongbridgeCliError,
  resetLongbridgeCliCacheForTests,
  runLongbridgeJson,
} from '../src/marketdata/longbridgeCli.js';

const dirs: string[] = [];

afterEach(() => {
  resetLongbridgeCliCacheForTests();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeCli(): string {
  const dir = mkdtempSync(join(tmpdir(), 'longbridge-cli-'));
  dirs.push(dir);
  const path = join(dir, 'longbridge');
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
  return path;
}

function fakeWindowsCli(subdir = ''): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), 'longbridge-win-'));
  dirs.push(root);
  const dir = subdir ? join(root, subdir) : root;
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'longbridge.exe');
  writeFileSync(path, '');
  chmodSync(path, 0o755);
  return { root, path };
}

describe('longbridge CLI on Windows', () => {
  it('finds longbridge.exe on PATH (Windows names it Path)', async () => {
    const { root, path } = fakeWindowsCli();
    const exec = vi.fn();
    await expect(
      locateLongbridgeCli({ env: { Path: root }, exec, platform: 'win32', standardPaths: [] }),
    ).resolves.toBe(path);
    expect(exec).not.toHaveBeenCalled();
  });

  it('finds the installer location under LOCALAPPDATA when PATH misses it', async () => {
    const { root, path } = fakeWindowsCli(join('Programs', 'longbridge'));
    await expect(
      locateLongbridgeCli({ env: { PATH: '', LOCALAPPDATA: root }, platform: 'win32' }),
    ).resolves.toBe(path);
  });

  it('does not try a login shell on Windows', async () => {
    const exec = vi.fn();
    await expect(
      locateLongbridgeCli({ env: { PATH: '' }, exec, platform: 'win32', standardPaths: [] }),
    ).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('longbridge CLI boundary', () => {
  it('prefers LONGBRIDGE_CLI_PATH over PATH', async () => {
    const cli = fakeCli();
    await expect(
      locateLongbridgeCli({ env: { LONGBRIDGE_CLI_PATH: cli, PATH: '' } }),
    ).resolves.toBe(cli);
  });

  it('reports a specific error when no executable can be found', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('missing'));
    await expect(
      locateLongbridgeCli({ env: { PATH: '', SHELL: '/bin/false' }, exec, standardPaths: [] }),
    ).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
  });

  it('executes without a shell, appends JSON output mode, and parses stdout', async () => {
    const cli = fakeCli();
    const exec = vi.fn().mockResolvedValue({ stdout: '{"ok":true}', stderr: 'upgrade notice' });
    await expect(
      runLongbridgeJson<{ ok: boolean }>(['quote', 'AAPL.US'], {
        env: { LONGBRIDGE_CLI_PATH: cli, PATH: '' },
        exec,
      }),
    ).resolves.toEqual({ ok: true });
    expect(exec).toHaveBeenCalledWith(
      cli,
      ['quote', 'AAPL.US', '--format', 'json'],
      expect.any(Object),
    );
  });

  it('does not include stdout in an invalid JSON error', async () => {
    const cli = fakeCli();
    const exec = vi.fn().mockResolvedValue({ stdout: 'secret-token', stderr: '' });
    const error = await runLongbridgeJson([], {
      env: { LONGBRIDGE_CLI_PATH: cli, PATH: '' },
      exec,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(LongbridgeCliError);
    expect(String(error)).not.toContain('secret-token');
  });
});
