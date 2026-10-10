#!/usr/bin/env node
// Releases what has merged into the base branch and installs it into the local desktop app.
//
//   node scripts/agent/release.mjs --changelog-file <path> [--dry-run] [--now]
//
// The changelog file holds the Chinese bullet lines for apps/desktop/CHANGELOG.md (that file is
// in Chinese). Steps: fast-forward to origin, refuse if the app is busy or the US market is
// open, bump the patch version, commit and push the release, build, package, install, then
// check the running app reports the new version. --now skips the market-hours rule only.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const desktop = join(root, 'apps', 'desktop');
const config = JSON.parse(readFileSync(join(root, 'scripts', 'agent', 'config.json'), 'utf8'));
const { base } = config;
const install = config.install;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ignoreMarketHours = args.includes('--now');

function step(message) {
  console.log(`\n▶ ${message}`);
}

function fail(message) {
  console.error(`refused: ${message}`);
  process.exit(1);
}

function run(cmd, cmdArgs, { cwd = root, env, quiet = false } = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: process.platform === 'win32' && !cmd.endsWith('.exe') && cmd !== 'git',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-25).join('\n');
    throw new Error(`${cmd} ${cmdArgs.join(' ')} failed (${result.status})\n${tail}`);
  }
  if (!quiet && result.stdout.trim())
    console.log(result.stdout.trim().split('\n').slice(-3).join('\n'));
  return result.stdout.trim();
}
const git = (cmdArgs) => run('git', cmdArgs, { quiet: true });

/** US regular session, 09:30–16:00 New York time on weekdays (holidays not counted). */
export function usMarketOpen(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

/** Why installing now would hurt the running app, or null. Restarting kills scans and analyses. */
async function appBusy() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const dbPath = join(appData, 'Kansoku', 'State', 'app.db');
  if (existsSync(dbPath)) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db.prepare("select value from app_meta where key = 'watchlist_scan_v1'").get();
      if (row && JSON.parse(String(row.value)).running === true)
        return 'a watchlist scan is running';
    } catch {
      // No scan record yet.
    } finally {
      db.close();
    }
  }
  const logPath = join(appData, 'Kansoku', 'logs', 'main.log');
  if (existsSync(logPath)) {
    const recent = readFileSync(logPath, 'utf8').split('\n').slice(-400).reverse();
    const last = recent.find((line) => line.includes('[ai-usage]'));
    const at = last ? Date.parse(last.slice(0, 24)) : Number.NaN;
    if (Number.isFinite(at) && Date.now() - at < 5 * 60_000)
      return 'an AI analysis ran in the last 5 minutes';
  }
  return null;
}

/** Whether a changed file ends up in the installed app (tests, docs and repo tooling do not). */
export function shipsInApp(path) {
  const p = path.replaceAll('\\', '/');
  if (/(^|\/)(test|tests|__tests__|__snapshots__)\//.test(p)) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p)) return false;
  if (
    /\.md$/i.test(p) &&
    !p.startsWith('.claude/skills/') &&
    !p.startsWith('packages/core/skills/')
  ) {
    return false;
  }
  if (/^(docs|scripts|\.github|journal|stocks)\//.test(p)) return false;
  return (
    p.startsWith('apps/web/') ||
    p.startsWith('apps/desktop/') ||
    p.startsWith('packages/') ||
    p.startsWith('.claude/skills/')
  );
}

function nextVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function stage(version) {
  const require = createRequire(join(desktop, 'package.json'));
  const asar = require('@electron/asar');
  const source = install.prepackagedApp;
  if (!existsSync(source)) fail(`missing the prepackaged app ${source}`);
  const dest = join(desktop, `release-agent-${version}`, 'app');
  rmSync(dirname(dest), { recursive: true, force: true });
  const work = mkdtempSync(join(tmpdir(), `kansoku-${version}-package-`));
  const previous = join(work, 'previous');
  asar.extractAll(join(source, 'resources', 'app.asar'), previous);
  const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
  const appStage = join(work, 'app');
  mkdirSync(appStage);
  cpSync(join(previous, 'node_modules'), join(appStage, 'node_modules'), { recursive: true });
  for (const part of ['dist-main', 'dist-preload']) {
    cpSync(join(desktop, part), join(appStage, part), { recursive: true });
  }
  delete manifest.scripts;
  delete manifest.devDependencies;
  writeFileSync(join(appStage, 'package.json'), JSON.stringify(manifest, null, 2));
  cpSync(source, dest, { recursive: true, filter: (p) => p !== join(source, 'resources') });
  const resources = join(dest, 'resources');
  mkdirSync(resources, { recursive: true });
  for (const [from, to] of [
    [join(root, 'apps', 'web', 'dist'), 'web-dist'],
    [join(desktop, 'dist-skills'), 'skills'],
    [join(desktop, 'dist-agent-kit'), 'kansoku-agent-kit'],
    [join(root, 'packages', 'core', 'drizzle'), 'drizzle'],
  ]) {
    if (!existsSync(from)) fail(`missing build output ${from}`);
    cpSync(from, join(resources, to), { recursive: true });
  }
  for (const part of ['icon.png', 'elevate.exe']) {
    if (existsSync(join(source, 'resources', part)))
      cpSync(join(source, 'resources', part), join(resources, part));
  }
  return { dest, appStage, resources, asar, require };
}

async function main() {
  const changelogPath = args[args.indexOf('--changelog-file') + 1];
  if (!args.includes('--changelog-file') || !changelogPath) fail('--changelog-file is required');
  const notes = readFileSync(changelogPath, 'utf8').trim();
  if (!notes.startsWith('- ')) fail('the changelog file must be bullet lines starting with "- "');

  step('Checking the checkout');
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']) !== base) fail(`not on ${base}`);
  if (git(['status', '--porcelain', '--untracked-files=no']))
    fail('the checkout has uncommitted changes');
  git(['fetch', 'origin', base]);
  git(['merge', '--ff-only', `origin/${base}`]);
  const lastRelease = git(['log', '-1', '--format=%H', '--grep=^chore(desktop): release']);
  if (lastRelease && git(['rev-list', '--count', `${lastRelease}..HEAD`]) === '0') {
    console.log('nothing new since the last release');
    return;
  }
  if (lastRelease) {
    const changed = git(['diff', '--name-only', `${lastRelease}..HEAD`])
      .split('\n')
      .filter(Boolean);
    if (!changed.some(shipsInApp)) {
      console.log('only tests, docs or tooling changed since the last release; nothing to install');
      return;
    }
  }

  step('Checking the app is free to restart');
  if (install.noInstallWhileUsMarketOpen && !ignoreMarketHours && usMarketOpen()) {
    fail('the US market is open; the app is likely in use (pass --now to override)');
  }
  const busy = await appBusy();
  if (busy) fail(`${busy}; try again later`);

  const pkgPath = join(desktop, 'package.json');
  const pkgText = readFileSync(pkgPath, 'utf8');
  const current = JSON.parse(pkgText).version;
  const version = nextVersion(current);
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, from: current, to: version, notes }, null, 2));
    return;
  }

  step(`Releasing ${version}`);
  writeFileSync(pkgPath, pkgText.replace(`"version": "${current}"`, `"version": "${version}"`));
  const logPath = join(desktop, 'CHANGELOG.md');
  const log = readFileSync(logPath, 'utf8');
  const firstEntry = log.indexOf('\n## ');
  if (firstEntry === -1) fail('could not find the first entry in CHANGELOG.md');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: install.timeZone }).format(new Date());
  writeFileSync(
    logPath,
    `${log.slice(0, firstEntry + 1)}## ${version} — ${today}\n\n${notes}\n\n${log.slice(firstEntry + 1)}`,
  );
  git(['add', 'apps/desktop/package.json', 'apps/desktop/CHANGELOG.md']);
  git([
    'commit',
    '-m',
    `chore(desktop): release ${version}`,
    '-m',
    'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
  ]);
  git(['push', 'origin', `${base}:${base}`]);

  step('Building');
  run('pnpm', ['install', '--frozen-lockfile'], { quiet: true });
  run('npx', ['vite', 'build', '--configLoader', 'runner'], {
    cwd: join(root, 'apps', 'web'),
    quiet: true,
  });
  run('npx', ['vite', 'build', '-c', 'vite.main.config.ts', '--configLoader', 'runner'], {
    cwd: desktop,
    env: { KANSOKU_LOCAL_TEST_BUILD: '1' },
    quiet: true,
  });
  run('npx', ['vite', 'build', '-c', 'vite.preload.config.ts', '--configLoader', 'runner'], {
    cwd: desktop,
    quiet: true,
  });
  run('node', ['scripts/stageSkills.mjs'], { cwd: desktop, quiet: true });
  run('node', ['scripts/stageAgentKit.mjs'], { cwd: desktop, quiet: true });

  step('Packaging');
  const staged = stage(version);
  await staged.asar.createPackage(staged.appStage, join(staged.resources, 'app.asar'));
  await staged.require(join(desktop, 'scripts', 'afterPack.cjs'))({
    appOutDir: staged.dest,
    electronPlatformName: 'win32',
    packager: { platform: { name: 'windows' } },
  });

  step(`Installing into ${install.dir}`);
  const busyAgain = await appBusy();
  if (busyAgain) fail(`${busyAgain}; the build is ready in ${staged.dest}, install later`);
  const ps = [
    `$ErrorActionPreference = 'Stop'`,
    `$src = '${staged.dest}'; $dst = '${install.dir}'`,
    `Get-Process | Where-Object { $_.Path -like "$dst\\*" } | Stop-Process -Force -Confirm:$false`,
    `Start-Sleep -Seconds 3`,
    `Copy-Item "$src\\resources\\app.asar" "$dst\\resources\\app.asar" -Force`,
    `foreach ($d in 'web-dist','drizzle','skills') { if (Test-Path "$dst\\resources\\$d") { Remove-Item "$dst\\resources\\$d" -Recurse -Force -Confirm:$false }; Copy-Item "$src\\resources\\$d" "$dst\\resources\\$d" -Recurse -Force }`,
    `Copy-Item "$src\\Kansoku.exe" "$dst\\Kansoku.exe" -Force`,
    `Remove-Item Env:TZ -ErrorAction SilentlyContinue`,
    `Start-Process -FilePath "$dst\\Kansoku.exe" -ArgumentList '--remote-debugging-port=${install.debugPort}'`,
  ].join('; ');
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]);

  step('Checking the running app');
  let reported = '';
  for (let i = 0; i < 20 && !reported.includes(`Kansoku/${version}`); i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const res = await fetch(`http://127.0.0.1:${install.debugPort}/json/version`);
      reported = (await res.json())['User-Agent'] ?? '';
    } catch {
      // Still starting.
    }
  }
  if (!reported.includes(`Kansoku/${version}`))
    fail(`the app did not come back as ${version} (got "${reported}")`);
  console.log(
    JSON.stringify({ released: version, installed: install.dir, app: reported }, null, 2),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
