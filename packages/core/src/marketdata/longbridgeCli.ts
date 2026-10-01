import { execFile } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join, win32 } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;
const STANDARD_PATHS = [
  '/opt/homebrew/bin/longbridge',
  '/usr/local/bin/longbridge',
  '/usr/bin/longbridge',
];
// The Windows installer puts it under %LOCALAPPDATA%/Programs/longbridge.
const WINDOWS_INSTALL_DIRS = ['Programs/longbridge', 'longbridge'];
const WINDOWS_EXTENSIONS = ['.exe', '.cmd', '.bat'];

export class LongbridgeCliError extends Error {
  constructor(
    message: string,
    readonly code: 'CLI_NOT_FOUND' | 'CLI_FAILED' | 'CLI_INVALID_JSON',
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'LongbridgeCliError';
  }
}

export interface LongbridgeCliDeps {
  env?: NodeJS.ProcessEnv;
  exec?: typeof execFileAsync;
  shell?: string;
  standardPaths?: string[];
  platform?: NodeJS.Platform;
}

let cachedCliPath: string | null = null;

export function resetLongbridgeCliCacheForTests(): void {
  cachedCliPath = null;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function windowsStandardPaths(env: NodeJS.ProcessEnv): string[] {
  const roots = [env.LOCALAPPDATA, env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean);
  return roots.flatMap((root) =>
    WINDOWS_INSTALL_DIRS.map((dir) => win32.join(root!, dir, 'longbridge.exe')),
  );
}

function pathCandidates(
  env: NodeJS.ProcessEnv,
  standardPaths: string[] | undefined,
  platform: NodeJS.Platform,
): string[] {
  const windows = platform === 'win32';
  // Windows keeps PATH as "Path" and has no extensionless executables.
  const pathValue = windows ? (env.PATH ?? env.Path ?? '') : (env.PATH ?? '');
  const entries = pathValue
    .split(windows ? ';' : delimiter)
    .filter(Boolean)
    .flatMap((dir) =>
      windows
        ? WINDOWS_EXTENSIONS.map((ext) => win32.join(dir, `longbridge${ext}`))
        : [join(dir, 'longbridge')],
    );
  const standard = standardPaths ?? (windows ? windowsStandardPaths(env) : STANDARD_PATHS);
  return [env.LONGBRIDGE_CLI_PATH, ...entries, ...standard].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

async function loginShellCandidate(deps: LongbridgeCliDeps): Promise<string | null> {
  // A login shell is how macOS GUI apps see the user's PATH; Windows apps already get it.
  if ((deps.platform ?? process.platform) === 'win32') return null;
  const exec = deps.exec ?? execFileAsync;
  const shell = deps.shell ?? deps.env?.SHELL ?? process.env.SHELL ?? '/bin/zsh';
  try {
    const { stdout } = await exec(shell, ['-lc', 'command -v longbridge'], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    const candidate = stdout.trim().split('\n')[0];
    return candidate && isAbsolute(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export async function locateLongbridgeCli(deps: LongbridgeCliDeps = {}): Promise<string> {
  if (cachedCliPath && (await isExecutable(cachedCliPath))) return cachedCliPath;
  const env = deps.env ?? process.env;
  const seen = new Set<string>();
  const platform = deps.platform ?? process.platform;
  for (const candidate of pathCandidates(env, deps.standardPaths, platform)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await isExecutable(candidate)) {
      cachedCliPath = candidate;
      return candidate;
    }
  }
  const shellCandidate = await loginShellCandidate(deps);
  if (shellCandidate && (await isExecutable(shellCandidate))) {
    cachedCliPath = shellCandidate;
    return shellCandidate;
  }
  throw new LongbridgeCliError(
    '未找到 longbridge CLI',
    'CLI_NOT_FOUND',
    '请先安装 longbridge CLI，或通过 LONGBRIDGE_CLI_PATH 指定可执行文件路径。',
  );
}

export interface RunLongbridgeOptions extends LongbridgeCliDeps {
  timeoutMs?: number;
  maxBuffer?: number;
}

export async function runLongbridgeJson<T>(
  args: string[],
  options: RunLongbridgeOptions = {},
): Promise<T> {
  const cli = await locateLongbridgeCli(options);
  const exec = options.exec ?? execFileAsync;
  try {
    const { stdout } = await exec(cli, [...args, '--format', 'json'], {
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
      env: options.env ?? process.env,
    });
    try {
      return JSON.parse(stdout) as T;
    } catch {
      throw new LongbridgeCliError('longbridge CLI 返回了无法识别的数据', 'CLI_INVALID_JSON');
    }
  } catch (error) {
    if (error instanceof LongbridgeCliError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new LongbridgeCliError('longbridge CLI 执行失败', 'CLI_FAILED', message);
  }
}

export interface LongbridgeAuthStatus {
  token?: {
    status?: string;
    path?: string;
    dc_region?: string;
  };
}

export function getLongbridgeAuthStatus(
  options: RunLongbridgeOptions = {},
): Promise<LongbridgeAuthStatus> {
  return runLongbridgeJson<LongbridgeAuthStatus>(['auth', 'status'], options);
}
