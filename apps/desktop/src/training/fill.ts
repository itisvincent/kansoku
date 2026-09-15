import { randomUUID } from 'node:crypto';
import type {
  TrainerBasePeriod,
  TrainerFillState,
  TrainerFillTask,
  TrainerFillTrigger,
  TrainerPoolCounts,
} from '@kansoku/pro-api';
import type { LocalCase } from './model.js';
import { periodCounts } from './model.js';
import { shuffled, TRAINER_SYMBOLS } from './source.js';
import type { TrainerStore } from './store.js';

export type CaseLoader = (
  symbol: string,
  period: TrainerBasePeriod,
  used: ReadonlySet<string>,
  signal: AbortSignal,
) => Promise<LocalCase>;

export class TrainerFill {
  private controller: AbortController | null = null;
  private readonly listeners = new Set<(state: TrainerFillState) => void>();

  constructor(
    private readonly store: TrainerStore,
    private readonly loadCase: CaseLoader,
  ) {}

  state(): TrainerFillState {
    const { task, autoRefillEnabled, autoRefillSuspended } = this.store.metadata;
    return { task, autoRefillEnabled, autoRefillSuspended };
  }

  subscribe(listener: (state: TrainerFillState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state());
      } catch {
        /* A closing renderer must not interrupt a refill. */
      }
    }
  }

  pool(): TrainerPoolCounts {
    const used = new Set([...this.store.sessions.values()].map((session) => session.caseId));
    const byBasePeriod = periodCounts();
    for (const record of this.store.cases.values()) {
      if (!used.has(record.id)) byBasePeriod[record.basePeriod]++;
    }
    return {
      total: Object.values(byBasePeriod).reduce((sum, count) => sum + count, 0),
      byBasePeriod,
    };
  }

  maybeRefill(period: TrainerBasePeriod, trigger: TrainerFillTrigger): void {
    const { autoRefillEnabled, autoRefillSuspended, task } = this.store.metadata;
    const available = this.pool().byBasePeriod[period];
    if (autoRefillEnabled && !autoRefillSuspended && task?.status !== 'running' && available < 2) {
      this.start(period, 3 - available, trigger);
    }
  }

  setEnabled(enabled: boolean): TrainerFillState {
    this.store.saveMetadata({
      ...this.store.metadata,
      autoRefillEnabled: enabled,
      autoRefillSuspended: enabled ? false : this.store.metadata.autoRefillSuspended,
    });
    this.publish();
    return this.state();
  }

  start(
    basePeriod: TrainerBasePeriod,
    count: number,
    trigger: TrainerFillTrigger,
  ): TrainerFillTask {
    const current = this.store.metadata.task;
    if (current?.status === 'running') {
      if (current.basePeriod !== basePeriod)
        throw new Error('A refill for another timeframe is already running');
      return current;
    }
    const now = new Date().toISOString();
    const task: TrainerFillTask = {
      id: randomUUID(),
      basePeriod,
      requested: count,
      trigger,
      status: 'running',
      phase: 'sample',
      activity: 'Loading completed historical candles',
      admitted: 0,
      error: null,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    this.store.saveMetadata({ ...this.store.metadata, task, autoRefillSuspended: false });
    this.controller = new AbortController();
    this.publish();
    // Catch here as well as inside run: disk failures must not become unhandled rejections.
    void this.run(task, this.controller.signal).catch((error) =>
      console.error('[trainer] refill failed', error),
    );
    return task;
  }

  private update(id: string, changes: Partial<TrainerFillTask>): void {
    const task = this.store.metadata.task;
    if (!task || task.id !== id || task.status !== 'running') return;
    const next = { ...task, ...changes, updatedAt: new Date().toISOString() };
    this.store.saveMetadata({
      ...this.store.metadata,
      task: next,
      autoRefillSuspended: next.status === 'failed',
    });
    this.publish();
  }

  private async run(task: TrainerFillTask, signal: AbortSignal): Promise<void> {
    let admitted = 0;
    let lastError: unknown;
    try {
      for (const symbol of shuffled(TRAINER_SYMBOLS)) {
        signal.throwIfAborted();
        this.update(task.id, {
          phase: 'sample',
          activity: `Loading historical case ${admitted + 1} of ${task.requested}`,
        });
        try {
          const used = new Set([...this.store.cases.values()].map((record) => record.sourceKey));
          const record = await this.loadCase(symbol, task.basePeriod, used, signal);
          signal.throwIfAborted();
          this.update(task.id, { phase: 'audit', activity: 'Saving an anonymous replay case' });
          this.store.saveCase(record);
          admitted++;
          this.update(task.id, { admitted });
          if (admitted >= task.requested) break;
        } catch (error) {
          signal.throwIfAborted();
          lastError = error;
          // Missing scopes, authentication and rate limits affect the entire source.
          if (/403|401|scope|auth|quota|301607|limit exceeded/i.test(String(error))) break;
        }
      }
      if (!admitted) throw lastError ?? new Error('No completed historical cases are available');
      this.update(task.id, {
        status: 'done',
        phase: 'audit',
        activity: `${admitted} training cases ready`,
        admitted,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (signal.aborted) return;
      this.update(task.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        activity: 'Could not load historical candles. Retry after checking the data connection.',
        finishedAt: new Date().toISOString(),
      });
    }
  }

  abort(id: string): TrainerFillTask {
    const task = this.store.metadata.task;
    if (!task || task.id !== id) throw new Error('Unknown refill task');
    if (task.status === 'running') {
      this.controller?.abort();
      this.update(id, {
        status: 'aborted',
        activity: 'Refill stopped',
        finishedAt: new Date().toISOString(),
      });
    }
    return this.store.metadata.task!;
  }

  dispose(): void {
    const task = this.store.metadata.task;
    if (task?.status === 'running') this.abort(task.id);
    this.listeners.clear();
  }
}
