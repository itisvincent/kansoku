import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

// Windows paths on every platform, so detection (and its tests) behave the same on CI.
const { dirname, join } = win32;

/**
 * The agents' bash tool is told it has a POSIX shell (`cat`, `$VAR`, `for … do`), and skills
 * reference `$KANSOKU_SKILLS_DIR`. Node runs `exec` through cmd.exe on Windows, where none of
 * that works, so on win32 we run commands through Git Bash instead.
 *
 * Only Git for Windows' `bin\bash.exe` is accepted: that wrapper puts `usr\bin` (cat, ls, sed…)
 * on PATH. `C:\Windows\System32\bash.exe` is WSL, which sees a different filesystem, so it is
 * never picked from PATH.
 */

type Exists = (path: string) => boolean;

/** From a directory holding git.exe (…\Git\cmd, …\Git\bin, …\Git\mingw64\bin) up to …\Git. */
function gitRootsFor(dir: string): string[] {
  const one = dirname(dir);
  return [dir, one, dirname(one)];
}

export function findGitBash(
  env: NodeJS.ProcessEnv = process.env,
  exists: Exists = existsSync,
): string | null {
  const override = env.KANSOKU_BASH?.trim();
  if (override && exists(override)) return override;

  const candidates: string[] = [];
  const pathValue = env.PATH ?? env.Path ?? '';
  for (const dir of pathValue.split(';').filter(Boolean)) {
    if (!exists(join(dir, 'git.exe'))) continue;
    for (const root of gitRootsFor(dir)) candidates.push(join(root, 'bin', 'bash.exe'));
  }
  for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs')]) {
    if (base) candidates.push(join(base, 'Git', 'bin', 'bash.exe'));
  }
  return candidates.find((path) => !/\\windows\\system32\\/i.test(path) && exists(path)) ?? null;
}

let cached: string | null | undefined;

/** Git Bash on Windows, resolved once; undefined elsewhere so exec keeps its default shell. */
export function agentShell(platform: NodeJS.Platform = process.platform): string | undefined {
  if (platform !== 'win32') return undefined;
  if (cached === undefined) cached = findGitBash();
  return cached ?? undefined;
}

export function resetAgentShellForTests(): void {
  cached = undefined;
}
