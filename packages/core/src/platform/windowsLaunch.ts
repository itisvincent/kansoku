import { existsSync, statSync } from 'node:fs';
import { win32 } from 'node:path';

/**
 * Running command-line tools on Windows. npm and pnpm install tools as `name.cmd`
 * launchers, which Node cannot spawn without a shell, and a shell spawn passes the path
 * and arguments to cmd.exe unquoted, so a path with spaces breaks.
 */

const DEFAULT_EXTENSIONS = ['.COM', '.EXE', '.BAT', '.CMD'];

/** Finds `bin` on a Windows PATH, trying each PATHEXT extension; null when absent. */
export function resolveWindowsCommand(
  bin: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (win32.extname(bin)) return bin;
  const extensions = (env.PATHEXT ?? DEFAULT_EXTENSIONS.join(';'))
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean);
  const dirs = (env.PATH ?? env.Path ?? '').split(';').filter(Boolean);
  const candidates = win32.isAbsolute(bin) ? [bin] : dirs.map((dir) => win32.join(dir, bin));
  for (const base of candidates) {
    for (const ext of extensions) {
      const full = `${base}${ext.toLowerCase()}`;
      try {
        if (existsSync(full) && statSync(full).isFile()) return full;
      } catch {
        // unreadable entry: keep looking
      }
    }
  }
  return null;
}

// cmd.exe expands %VAR% and ends the command at a newline even inside quotes, and a
// quote inside an argument cannot be escaped reliably. Such text must go through stdin.
const UNSAFE_FOR_CMD = /["%\r\n]/;

export interface LaunchSpec {
  file: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

/**
 * How to start `path` with `args`. A .cmd/.bat launcher runs through cmd.exe with every
 * part quoted; anything else is spawned directly.
 */
export function launchSpec(
  path: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): LaunchSpec {
  if (!/\.(cmd|bat)$/i.test(path)) return { file: path, args };
  const parts = [path, ...args];
  const unsafe = parts.find((part) => UNSAFE_FOR_CMD.test(part));
  if (unsafe !== undefined) {
    throw new Error(
      `cannot pass ${JSON.stringify(unsafe.slice(0, 40))} to a Windows .cmd launcher; send it through stdin`,
    );
  }
  const line = parts.map((part) => `"${part}"`).join(' ');
  return {
    file: env.ComSpec ?? 'cmd.exe',
    // /s keeps the outer quotes as the whole command line; /d skips AutoRun scripts.
    args: ['/d', '/s', '/c', `"${line}"`],
    windowsVerbatimArguments: true,
  };
}
