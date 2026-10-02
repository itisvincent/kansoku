/**
 * Account data (positions, portfolio, watchlist) is cached at several layers, and failures
 * are remembered so a broken source is not retried every few seconds. A user pressing
 * Refresh wants all of that forgotten at once; each layer registers how to forget here.
 */
const resets = new Set<() => void>();

export function onAccountCacheReset(reset: () => void): () => void {
  resets.add(reset);
  return () => {
    resets.delete(reset);
  };
}

export function resetAccountCaches(): void {
  for (const reset of resets) {
    try {
      reset();
    } catch {
      // One layer failing to reset must not stop the others.
    }
  }
}
