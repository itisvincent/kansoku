#!/usr/bin/env node
// Releases what has merged into the base branch and installs it into the local desktop app.
//
//   node scripts/agent/release.mjs --changelog-file <path> [--dry-run] [--now]
//
// The changelog file holds the Chinese bullet lines for apps/desktop/CHANGELOG.md (that file is
// in Chinese). Steps: fast-forward to origin, wait while an earlier release PR is still open,
// refuse if the app is busy or the US market is open, bump the patch version, build, package,
// install, check the running app reports the new version, and only then open the release PR
// as the bot (main is protected). --now skips the market-hours rule only.
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
import { botToken, pushArgs } from './bot.mjs';
import { RELEASE_BRANCH } from './risk.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const desktop = join(root, 'apps', 'desktop');
const config = JSON.parse(readFileSync(join(root, 'scripts', 'agent', 'config.json'), 'utf8'));
const { base } = config;
const install = config.install;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ignoreMarketHours = args.includes('--now');
let token = '';

function step(message) {
  console.log(`\n▶ ${message}`);
}

function fail(message) {
  console.error(`refused: ${message}`);
  process.exit(1);
}

function run(cmd, cmdArgs, { cwd = root, env, quiet = false, allowFail = false } = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: process.platform === 'win32' && !cmd.endsWith('.exe') && cmd !== 'git' && cmd !== 'gh',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFail) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-25).join('\n');
    // Never print the bot's login, which sits in the push arguments.
    const shown = cmdArgs.map((a) => (a.includes('extraheader') ? '<bot login>' : a)).join(' ');
    throw new Error(`${cmd} ${shown} failed (${result.status})\n${tail}`);
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

/**
 * Why installing now would hurt the running app, or null. Restarting kills scans and analyses.
 * When the state cannot be read, it counts as busy: a failed read is not a free app.
 */
export async function appBusy() {
  const appData = process.env.APPDATA;
  if (!appData) return 'APPDATA is not set, so the app state cannot be checked';
  const dbPath = join(appData, 'Kansoku', 'State', 'app.db');
  if (existsSync(dbPath)) {
    let row;
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        row = db.prepare("select value from app_meta where key = 'watchlist_scan_v1'").get();
      } finally {
        db.close();
      }
      // No row means no scan has ever run.
      if (row && JSON.parse(String(row.value)).running === true)
        return 'a watchlist scan is running';
    } catch (error) {
      return `could not read the scan state (${error instanceof Error ? error.message : error})`;
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
  if (!existsSync(source)) throw new Error(`missing the prepackaged app ${source}`);
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
    if (!existsSync(from)) throw new Error(`missing build output ${from}`);
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
  token = await botToken(config);
  const waiting = openReleasePr();
  if (waiting) {
    console.log(`release PR #${waiting.number} has not merged yet; nothing to do until it does`);
    return;
  }
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

  // The version and changelog are written now (the build reads them) but only committed and
  // pushed after the app runs the new version. Any failure before that puts both files back.
  step(`Releasing ${version}`);
  const logPath = join(desktop, 'CHANGELOG.md');
  const log = readFileSync(logPath, 'utf8');
  const firstEntry = log.indexOf('\n## ');
  if (firstEntry === -1) fail('could not find the first entry in CHANGELOG.md');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone }).format(new Date());
  const releaseFiles = ['apps/desktop/package.json', 'apps/desktop/CHANGELOG.md'];
  writeFileSync(pkgPath, pkgText.replace(`"version": "${current}"`, `"version": "${version}"`));
  writeFileSync(
    logPath,
    `${log.slice(0, firstEntry + 1)}## ${version} — ${today}\n\n${notes}\n\n${log.slice(firstEntry + 1)}`,
  );
  let reported;
  try {
    reported = await buildAndInstall(version);
  } catch (error) {
    git(['checkout', '--', ...releaseFiles]);
    throw error;
  }

  // main is protected: the version bump goes in as a PR from the bot, which the manager merges
  // once the checks pass (queue.mjs merge accepts a release PR that only bumps the version).
  step('Recording the release');
  const branch = `${RELEASE_BRANCH}${version}`;
  const title = `chore(desktop): release ${version}`;
  git(['checkout', '-b', branch]);
  try {
    git(['add', ...releaseFiles]);
    git(['commit', '-m', title, '-m', 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>']);
    git(pushArgs(token, config.repo, `${branch}:refs/heads/${branch}`));
    const url = run(
      'gh',
      [
        'pr',
        'create',
        '--repo',
        config.repo,
        '--base',
        base,
        '--head',
        branch,
        '--title',
        title,
        '--body',
        `Installed and running as ${version} on the owner's machine.\n\n${notes}`,
      ],
      { quiet: true, env: { GH_TOKEN: token } },
    );
    console.log(
      JSON.stringify(
        { released: version, installed: install.dir, app: reported, pr: url },
        null,
        2,
      ),
    );
  } catch (error) {
    throw new Error(
      `${version} is installed but its release PR was not opened; the commit is on the local branch ${branch} (${error.message})`,
    );
  } finally {
    git(['checkout', base]);
  }
}

/** The open release PR, if one is still waiting to merge. */
function openReleasePr() {
  const prs = JSON.parse(
    run(
      'gh',
      [
        'pr',
        'list',
        '--repo',
        config.repo,
        '--state',
        'open',
        '--json',
        'number,headRefName',
        '--limit',
        '100',
      ],
      { quiet: true, env: { GH_TOKEN: token } },
    ) || '[]',
  );
  return prs.find((p) => p.headRefName.startsWith(RELEASE_BRANCH)) ?? null;
}

/** Builds, packages and installs `version`; returns the running app's user agent. Throws on any failure. */
async function buildAndInstall(version) {
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
  if (busyAgain) throw new Error(`${busyAgain}; nothing was installed, the next round tries again`);
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
    throw new Error(`the app did not come back as ${version} (got "${reported}")`);
  return reported;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
