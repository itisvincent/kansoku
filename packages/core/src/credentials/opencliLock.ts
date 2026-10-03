/**
 * opencli drives one browser tab. Two commands at once make one of them fail ("Debugger is
 * not attached to the tab", printed as `ok: false`), so every opencli use in this process —
 * the Settings check and the analysts' X lookups — waits for the one before it.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withOpencliLock<T>(run: () => Promise<T>): Promise<T> {
  const result = tail.then(() => run());
  tail = result.catch(() => {});
  return result;
}

/** A shell command that runs opencli (by name or by its path). */
export function usesOpencli(command: string): boolean {
  return /(?:^|[\s/\\;&|('"`])opencli(?:\.cmd|\.exe|\.ps1)?(?=[\s;&|)'"`]|$)/i.test(command);
}
