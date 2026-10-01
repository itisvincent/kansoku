import { describe, expect, it } from 'vitest';
import {
  buildMounts,
  isAllowedMountFile,
  isInsideRoot,
  resolveMountedPath,
  resolveRepoRelative,
} from '../src/ai/agents/agentTools/fsMounts.js';

const win = process.platform === 'win32';

describe('isInsideRoot', () => {
  it.skipIf(!win)('rejects another drive and UNC paths on Windows', () => {
    const root = String.raw`C:\Users\me\Workspace`;
    expect(isInsideRoot(root, String.raw`D:\x.md`)).toBe(false);
    expect(isInsideRoot(root, String.raw`E:\Workspace\kansoku\CLAUDE.md`)).toBe(false);
    expect(isInsideRoot(root, String.raw`\\server\share\f.md`)).toBe(false);
    expect(isInsideRoot(root, String.raw`C:\Users\me\Workspace\stocks\MU.md`)).toBe(true);
  });

  it('rejects parent escapes and accepts the root itself', () => {
    const root = win ? String.raw`C:\Users\me\Workspace` : '/home/me/workspace';
    const parent = win ? String.raw`C:\Users\me\secret.txt` : '/home/me/secret.txt';
    expect(isInsideRoot(root, parent)).toBe(false);
    expect(isInsideRoot(root, root)).toBe(true);
  });
});

describe('agent file access', () => {
  const root = win ? String.raw`C:\Users\me\Workspace` : '/home/me/workspace';

  it.skipIf(!win)('does not resolve a path on another drive', () => {
    expect(resolveRepoRelative(root, String.raw`D:\x.md`)).toBeNull();
    expect(resolveMountedPath(buildMounts(root), 'project', String.raw`D:\x.md`)).toBeNull();
  });

  it('never exposes key material or raw databases', () => {
    const mount = buildMounts(root).get('project')!;
    const blocked = [
      '.env',
      'journal/charts/data/ai-secret.key',
      'journal/charts/data/app.db',
      'journal/charts/data/app.db-wal',
      'State/ai-master-key.json',
    ];
    for (const rel of blocked) {
      const path = resolveMountedPath(buildMounts(root), 'project', rel)!.path;
      expect(isAllowedMountFile(mount, path), rel).toBe(false);
    }
    const note = resolveMountedPath(buildMounts(root), 'project', 'stocks/MU.md')!.path;
    expect(isAllowedMountFile(mount, note)).toBe(true);
  });
});
