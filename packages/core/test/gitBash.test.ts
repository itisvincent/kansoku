import { describe, expect, it } from 'vitest';
import { agentShell, findGitBash } from '../src/ai/agents/agentTools/gitBash.js';

const has = (...paths: string[]) => {
  const set = new Set(paths.map((p) => p.toLowerCase()));
  return (path: string) => set.has(path.toLowerCase());
};

describe('findGitBash', () => {
  it('finds Git Bash next to a git.exe on PATH, wherever Git is installed', () => {
    const env = { PATH: String.raw`C:\Windows\System32;D:\application\Git\cmd` };
    const exists = has(
      String.raw`D:\application\Git\cmd\git.exe`,
      String.raw`D:\application\Git\bin\bash.exe`,
    );
    expect(findGitBash(env, exists)).toBe(String.raw`D:\application\Git\bin\bash.exe`);
  });

  it('also resolves from mingw64\\bin', () => {
    const env = { PATH: String.raw`D:\application\Git\mingw64\bin` };
    const exists = has(
      String.raw`D:\application\Git\mingw64\bin\git.exe`,
      String.raw`D:\application\Git\bin\bash.exe`,
    );
    expect(findGitBash(env, exists)).toBe(String.raw`D:\application\Git\bin\bash.exe`);
  });

  it('never picks the WSL bash in System32', () => {
    const env = { PATH: String.raw`C:\Windows\System32` };
    const exists = has(String.raw`C:\Windows\System32\git.exe`, String.raw`C:\Windows\System32\bin\bash.exe`);
    expect(findGitBash(env, exists)).toBeNull();
  });

  it('falls back to the standard install folder', () => {
    const env = { PATH: '', ProgramFiles: String.raw`C:\Program Files` };
    const exists = has(String.raw`C:\Program Files\Git\bin\bash.exe`);
    expect(findGitBash(env, exists)).toBe(String.raw`C:\Program Files\Git\bin\bash.exe`);
  });

  it('honours an explicit KANSOKU_BASH override', () => {
    const env = { KANSOKU_BASH: String.raw`E:\tools\bash.exe`, PATH: '' };
    expect(findGitBash(env, has(String.raw`E:\tools\bash.exe`))).toBe(String.raw`E:\tools\bash.exe`);
  });

  it('returns null when no Git Bash exists', () => {
    expect(findGitBash({ PATH: '' }, () => false)).toBeNull();
  });
});

describe('agentShell', () => {
  it('keeps the default shell off Windows', () => {
    expect(agentShell('darwin')).toBeUndefined();
    expect(agentShell('linux')).toBeUndefined();
  });
});
