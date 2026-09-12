import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createPackage } from '@electron/asar';

const require = createRequire(import.meta.url);
const afterPack = require('../scripts/afterPack.cjs');
const temporaryDirectories: string[] = [];

async function fixture(locales: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'kansoku-pack-test-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'resources'));
  await mkdir(join(root, 'locales'));
  await mkdir(join(root, 'source'));
  await writeFile(join(root, 'source', 'package.json'), '{}');
  await createPackage(join(root, 'source'), join(root, 'resources', 'app.asar'));
  for (const locale of locales) await writeFile(join(root, 'locales', `${locale}.pak`), 'fixture');
  return {
    appOutDir: root,
    electronPlatformName: 'win32',
    packager: { platform: { name: 'windows' } },
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true })));
});

test('rejects a Windows package without the English fallback locale', async () => {
  await expect(afterPack(await fixture(['zh-CN']))).rejects.toThrow('en-US.pak');
});

test('rejects a Windows package without the Chinese locale', async () => {
  await expect(afterPack(await fixture(['en-US']))).rejects.toThrow('zh-CN.pak');
});

test('accepts both Windows runtime locales', async () => {
  await expect(afterPack(await fixture(['en-US', 'zh-CN']))).resolves.toBeUndefined();
});
