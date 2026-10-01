/**
 * Runs the user asked for from this app (Run analysis, Rebuild multiples), by symbol. A cockpit
 * pinned to an older analysis only jumps to a new one when the user asked for that run; runs a
 * watchlist scan starts in the background must not pull the page away.
 */
const requested = new Map<string, number>();

const key = (symbol: string) => symbol.trim().toUpperCase();

export function noteRunRequested(symbol: string, at: number = Date.now()): void {
  requested.set(key(symbol), at);
}

/** True once for a run the user requested before it ended; clears the request. */
export function consumeRunRequest(symbol: string, endedAt: string): boolean {
  const at = requested.get(key(symbol));
  if (at === undefined) return false;
  requested.delete(key(symbol));
  const ended = Date.parse(endedAt);
  return Number.isNaN(ended) || at <= ended;
}

export function resetRunRequestsForTests(): void {
  requested.clear();
}
