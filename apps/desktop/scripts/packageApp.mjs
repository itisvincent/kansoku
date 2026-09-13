import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const proNative = join(process.cwd(), 'pro', 'kansoku_icloud.node');
const isMac = process.platform === 'darwin';
const args = isMac ? ['--mac', 'dmg', 'zip', '--arm64'] : ['--win', 'nsis', 'zip', '--x64'];
if (isMac && existsSync(proNative)) {
  args.push('--config.mac.entitlements=build/entitlements.mac.plist');
}

// CloudKit aborts the process (uncatchable brk) when the caller has no
// team-signed iCloud entitlement, so an ad-hoc local build with the Pro
// native module crashes seconds after launch. afterPack signs a local test
// build with the Keychain's Developer ID (by hash — electron-builder signs by
// name, which is ambiguous with two same-named certs) and borrows the
// installed app's provisioning profile.
function localSigningIdentity() {
  const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  });
  const matches = [...output.matchAll(/\)\s+([0-9A-F]{40})\s+"(Developer ID Application:[^"]+)"/g)];
  return matches.at(-1)?.[1] ?? null;
}

if (isMac && process.env.KANSOKU_LOCAL_TEST_BUILD === '1' && existsSync(proNative)) {
  const identity = localSigningIdentity();
  const profile =
    process.env.KANSOKU_PROVISIONING_PROFILE ??
    '/Applications/Kansoku.app/Contents/embedded.provisionprofile';
  if (identity && existsSync(profile)) {
    process.env.KANSOKU_LOCAL_SIGN_IDENTITY = identity;
    process.env.KANSOKU_PROVISIONING_PROFILE = profile;
    console.log(`packageApp: local test build signed with ${identity}, profile ${profile}`);
  } else {
    console.warn(
      'packageApp: no Developer ID identity or provisioning profile found — ad-hoc build, iCloud will crash on launch',
    );
  }
}

// The local test build runs with the license gate baked open
// (packages/core/src/license/licenseGate.ts). Name the artifacts so a test
// build can never be confused with — or shipped as — a normal release.
if (process.env.KANSOKU_LOCAL_TEST_BUILD === '1') {
  args.push('--config.artifactName=Kansoku-${version}-local-test-${arch}.${ext}');
  // electron-builder.yml sets win.artifactName, which shadows the top-level key.
  args.push('--config.win.artifactName=Kansoku-${version}-local-test-${arch}.${ext}');
}

const builderCommand = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.CMD' : 'electron-builder',
);
const result =
  process.platform === 'win32'
    ? spawnSync(builderCommand, args, { stdio: 'inherit', shell: true })
    : spawnSync(builderCommand, args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
