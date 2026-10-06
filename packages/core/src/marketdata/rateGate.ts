const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Longbridge's "too many requests" answer, as the CLI reports it. */
export function isRateLimited(error: unknown): boolean {
  const text = error instanceof Error ? error.message : '';
  return /429002|rate limit of/i.test(text);
}

export interface RateGate {
  run<T>(call: () => Promise<T>): Promise<T>;
}

/**
 * Runs calls one at a time, at least `minIntervalMs` apart, and retries a call the server
 * rate-limited. For endpoints that allow one request per interval: several callers firing
 * at once (the home calendar, the event collector, a chart's event-risk card) otherwise
 * all get refused and quietly report "no events".
 */
export function createRateGate(options: {
  minIntervalMs: number;
  retries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RateGate {
  const { minIntervalMs, retries = 2 } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  const spaced = async <T>(call: () => Promise<T>): Promise<T> => {
    const wait = lastStart + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastStart = now();
    return call();
  };

  const attempt = async <T>(call: () => Promise<T>): Promise<T> => {
    for (let tries = 0; ; tries += 1) {
      try {
        return await spaced(call);
      } catch (error) {
        if (!isRateLimited(error) || tries >= retries) throw error;
      }
    }
  };

  return {
    run<T>(call: () => Promise<T>): Promise<T> {
      const result = tail.then(() => attempt(call));
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
