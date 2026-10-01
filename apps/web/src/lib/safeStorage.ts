/**
 * localStorage that never throws. Access fails in a private window, with site data
 * blocked or when the quota is full; a remembered preference is not worth crashing a
 * chart over, so a failed read gives null and a failed write is skipped.
 */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved this time; the in-memory value still applies.
  }
}
