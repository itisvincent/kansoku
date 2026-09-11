import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') {
  console.log('[buildNative] Sparkle is macOS-only — skipping native bridge build');
  process.exit(0);
}

const result = spawnSync('npx', ['electron-sparkle-updater', 'rebuild', '--arch', 'arm64'], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
