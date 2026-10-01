import {
  exec as nodeExec,
  execFile as nodeExecFile,
  type ChildProcess,
  type ExecException,
} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { locateOpencli } from '../../../credentials/opencli.js';
import { locateLongbridgeCli } from '../../../marketdata/longbridgeCli.js';
import { resolveAugmentedPath, resetUserPathCacheForTests } from '../../../platform/userPath.js';
import { textResult } from '../dataTools.js';
import { agentShell } from './gitBash.js';

const OUTPUT_TRUNCATE_CHARS = 30_000;
const OUTPUT_PREVIEW_CHARS = 12_000;
const REJECTED_PATTERNS = [/>>?/, /\btee\s/, /\brm\s/, /\bmv\s/, /\bcp\s/];
const BASH_TIMEOUT_MS = 120_000;
const BASH_MAX_BUFFER = 10 * 1024 * 1024;
const TRANSCRIPT_PAGE_CHARS = 20_000;
const TRANSCRIPT_MAX_PAGE_CHARS = 30_000;
const TRANSCRIPT_TTL_MS = 24 * 60 * 60_000;
const TRANSCRIPT_ID_RE = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;
const TRANSCRIPT_DIR = join(tmpdir(), 'kansoku', 'bash');

export type ExecResult = { stdout: string; stderr: string; exitCode?: number };
export type ExecFn = (command: string, signal?: AbortSignal) => Promise<ExecResult>;

let cachedExecPathPromise: Promise<string> | null = null;

export function resetExecPathCacheForTests(): void {
  cachedExecPathPromise = null;
  resetUserPathCacheForTests();
}

// Finder-launched Electron inherits a bare PATH (/usr/bin:/bin:...), so CLIs
// installed via n/nvm/homebrew are invisible to plain `sh -c` without help.
function resolveExecPath(): Promise<string> {
  cachedExecPathPromise ??= (async () => {
    const extra: string[] = [];
    try {
      extra.push(dirname(await locateLongbridgeCli()));
    } catch {}
    try {
      const opencli = await locateOpencli();
      if (opencli) extra.push(dirname(opencli));
    } catch {}
    return resolveAugmentedPath({ extraDirs: extra });
  })();
  return cachedExecPathPromise;
}

const SECRET_NAME = /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)$/i;
/** Secrets the skill scripts actually read; everything else secret-looking stays out. */
const SKILL_SECRETS = new Set(['FRED_API_KEY', 'HITHINK_FINANCE_API_KEY']);

/**
 * Environment handed to agent shell commands. AI provider keys, GitHub tokens and the like
 * are dropped: the agent's output goes back to the model provider, so `env` must not be able
 * to print them. Longbridge's own variables stay so the CLI keeps working.
 */
export function agentEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    const keep = !SECRET_NAME.test(name) || SKILL_SECRETS.has(name) || name.startsWith('LONGBRIDGE_');
    if (keep) out[name] = value;
  }
  return out;
}

/** Forward slashes work in Git Bash globs and in native Windows programs alike. */
function shellPath(path: string, usingGitBash: boolean): string {
  return usingGitBash ? path.replaceAll('\\', '/') : path;
}

/**
 * Stops a command and everything it started. Git Bash's own processes are not all reachable
 * through the Windows process tree, so with Git Bash the command's process group is killed
 * from inside Git Bash (the command records its id in `pidFile`), and the Windows tree kill
 * runs as a fallback.
 */
function killTree(child: ChildProcess, shell: string | undefined, pidFile: string | null): void {
  if (shell && pidFile) {
    readFile(pidFile, 'utf8')
      .then((raw) => {
        const pid = raw.trim();
        if (!/^\d+$/.test(pid)) return;
        nodeExecFile(shell, ['-c', `kill -9 -${pid} 2>/dev/null; kill -9 ${pid} 2>/dev/null; true`], () => {});
      })
      .catch(() => {});
  }
  if (process.platform === 'win32' && child.pid) {
    nodeExecFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
    return;
  }
  child.kill('SIGKILL');
}

export function createDefaultExec(repoRoot: string): ExecFn {
  return async (command: string, signal?: AbortSignal) => {
    const shell = agentShell();
    const skillsDir = process.env.TRADE_SKILLS_DIR ?? join(repoRoot, '.claude', 'skills');
    const appSkillsDir =
      process.env.TRADE_SKILLS_DIR ?? join(repoRoot, 'packages', 'core', 'skills');
    const env: NodeJS.ProcessEnv = {
      ...agentEnv(process.env),
      KANSOKU_APP_SKILLS_DIR: shellPath(appSkillsDir, Boolean(shell)),
      KANSOKU_SKILLS_DIR: shellPath(skillsDir, Boolean(shell)),
      PATH: await resolveExecPath(),
      // Git Bash re-parses its Windows command line (\\ collapses, globs expand), so the
      // command travels in an environment variable and is eval'd verbatim.
      ...(shell ? { KANSOKU_BASH_COMMAND: command } : {}),
    };
    const pidFile = shell
      ? join(tmpdir(), `kansoku-bash-${randomUUID()}.pid`).replaceAll('\\', '/')
      : null;
    if (pidFile) env.KANSOKU_PID_FILE = pidFile;
    if (signal?.aborted) return { stdout: '', stderr: 'aborted', exitCode: 130 };
    return await new Promise<ExecResult>((resolve, reject) => {
      let stopped: 'aborted' | 'timeout' | null = null;
      const options = {
        cwd: repoRoot,
        env,
        maxBuffer: BASH_MAX_BUFFER,
        windowsHide: true,
      };
      const onDone = (error: ExecException | null, stdout: string, stderr: string) => {
        clearTimeout(timer);
        if (pidFile) void rm(pidFile, { force: true }).catch(() => {});
        signal?.removeEventListener('abort', onAbort);
        if (stopped) {
          resolve({
            stdout,
            stderr: stopped === 'timeout' ? `timed out after ${BASH_TIMEOUT_MS / 1000}s` : 'aborted',
            exitCode: stopped === 'timeout' ? 124 : 130,
          });
          return;
        }
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0 });
          return;
        }
        if (typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolve({ stdout, stderr, exitCode: error.code });
      };
      const child = shell
        ? nodeExecFile(
            shell,
            ['-c', 'printf %s "$$" > "$KANSOKU_PID_FILE"; eval "$KANSOKU_BASH_COMMAND"'],
            options,
            onDone,
          )
        : nodeExec(command, options, onDone);
      // No command is interactive; an open stdin would make `cat` with no file wait forever.
      child.stdin?.end();
      const stop = (reason: 'aborted' | 'timeout') => {
        if (stopped) return;
        stopped = reason;
        killTree(child, shell, pidFile);
      };
      const timer = setTimeout(() => stop('timeout'), BASH_TIMEOUT_MS);
      const onAbort = () => stop('aborted');
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  };
}

async function cleanupOldTranscripts(now = Date.now()): Promise<void> {
  let entries;
  try {
    entries = await readdir(TRANSCRIPT_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
      .map(async (entry) => {
        const path = join(TRANSCRIPT_DIR, entry.name);
        try {
          if (now - (await stat(path)).mtimeMs > TRANSCRIPT_TTL_MS) await rm(path);
        } catch {
          // Another process may have cleaned the same transcript first.
        }
      }),
  );
}

async function saveTranscript(text: string): Promise<{ id: string; path: string }> {
  await mkdir(TRANSCRIPT_DIR, { recursive: true, mode: 0o700 });
  await cleanupOldTranscripts();
  const id = randomUUID();
  const path = join(TRANSCRIPT_DIR, `${id}.log`);
  await writeFile(path, text, { encoding: 'utf8', mode: 0o600 });
  return { id, path };
}

export function isRejectedCommand(command: string): boolean {
  return REJECTED_PATTERNS.some((re) => re.test(command));
}

const bashSchema = Type.Object({ command: Type.String() });
const transcriptSchema = Type.Object({
  transcript_id: Type.String(),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: TRANSCRIPT_MAX_PAGE_CHARS })),
});

export function buildBashTool(exec: ExecFn): AgentTool<typeof bashSchema> {
  return {
    name: 'bash',
    label: 'Bash',
    description: 'Run a shell command (cwd = repo root). Read-only commands only; no file writes.',
    parameters: bashSchema,
    execute: async (_id, params, signal) => {
      const command = params.command;
      if (isRejectedCommand(command)) {
        return textResult(`rejected: command "${command}" matches a disallowed write pattern`);
      }
      try {
        const { stdout, stderr, exitCode = 0 } = await exec(command, signal);
        const output = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`;
        const status = exitCode === 0 ? '' : `[exit_code ${exitCode}]\n`;
        if (output.length <= OUTPUT_TRUNCATE_CHARS) return textResult(`${status}${output}`);
        const transcript = await saveTranscript(output);
        return textResult(
          [
            `${status}Output is too large to return inline. The complete output was saved without truncation.`,
            `transcript_id=${transcript.id}`,
            `transcript_path=${transcript.path.replaceAll('\\', '/')}`,
            `chars=${output.length} bytes=${Buffer.byteLength(output, 'utf8')} lines=${output.split('\n').length}`,
            'Use bash with rg/grep on transcript_path for targeted lookup. Use read_bash_transcript with transcript_id for lossless sequential reading.',
            '',
            '[preview]',
            output.slice(0, OUTPUT_PREVIEW_CHARS),
          ].join('\n'),
        );
      } catch (err) {
        return textResult(`command failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export function buildReadBashTranscriptTool(): AgentTool<typeof transcriptSchema> {
  return {
    name: 'read_bash_transcript',
    label: 'Read Bash Transcript',
    description:
      'Read a lossless page from a complete Bash output saved to a transcript file. Continue with next_offset until eof=true. Prefer rg or grep through bash when looking for specific text.',
    parameters: transcriptSchema,
    execute: async (_id, params) => {
      if (!TRANSCRIPT_ID_RE.test(params.transcript_id)) {
        return textResult('rejected: invalid transcript_id');
      }
      try {
        const text = await readFile(join(TRANSCRIPT_DIR, `${params.transcript_id}.log`), 'utf8');
        const offset = params.offset ?? 0;
        if (offset > text.length) return textResult('rejected: offset exceeds transcript length');
        const nextOffset = Math.min(text.length, offset + (params.limit ?? TRANSCRIPT_PAGE_CHARS));
        return textResult(
          JSON.stringify({
            transcript_id: params.transcript_id,
            offset,
            next_offset: nextOffset,
            eof: nextOffset === text.length,
            text: text.slice(offset, nextOffset),
          }),
        );
      } catch (error) {
        return textResult(
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'transcript not found or expired'
            : `transcript read failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
