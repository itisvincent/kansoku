import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainerFillState } from '@kansoku/pro-api';
import type { LocalCase } from '../../src/training/model.js';
import { LocalTrainer } from '../../src/training/runtime.js';
import { TrainerStore } from '../../src/training/store.js';
import { fixedCase } from './fixtures.js';

describe('trainer refill lifecycle', () => {
  let directory: string;
  let trainer: LocalTrainer;
  let store: TrainerStore;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'kansoku-trainer-fill-'));
    store = new TrainerStore(directory);
  });
  afterEach(() => {
    trainer?.fill.dispose();
    rmSync(directory, { recursive: true, force: true });
  });

  it('starts once on an empty pool, publishes completion and opens the admitted case', async () => {
    let resolve!: (record: LocalCase) => void;
    const load = vi.fn(
      () =>
        new Promise<LocalCase>((done) => {
          resolve = done;
        }),
    );
    trainer = new LocalTrainer(store, load, join(directory, 'journal'));
    const frames: TrainerFillState[] = [];
    trainer.fill.subscribe((state) => frames.push(state));
    expect(() => trainer.open({ basePeriod: '5m' })).toThrow('No training cases');
    const task = trainer.getFill().task!;
    expect(() => trainer.open({ basePeriod: '5m' })).toThrow('No training cases');
    trainer.startFill({ basePeriod: '5m', count: 3 });
    expect(load).toHaveBeenCalledTimes(1);
    resolve(fixedCase());
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    resolve(fixedCase());
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    resolve(fixedCase());
    await vi.waitFor(() => expect(trainer.getFill().task?.status).toBe('done'));
    expect(frames.at(-1)?.task).toMatchObject({ id: task.id, admitted: 3 });
    expect(trainer.open({ basePeriod: '5m' }).view.remainingBars).toBe(5);
  });

  it('suspends automatic retries on an authentication error and supports an explicit retry', async () => {
    const load = vi.fn().mockRejectedValue(new Error('API error 403308: scope is not authorized'));
    trainer = new LocalTrainer(store, load, join(directory, 'journal'));
    trainer.listPool();
    await vi.waitFor(() => expect(trainer.getFill().task?.status).toBe('failed'));
    expect(trainer.getFill().autoRefillSuspended).toBe(true);
    trainer.listPool();
    expect(load).toHaveBeenCalledTimes(1);
    load.mockResolvedValue(fixedCase());
    trainer.startFill({ basePeriod: '5m', count: 1 });
    await vi.waitFor(() => expect(trainer.getFill().task?.status).toBe('done'));
    expect(trainer.getFill().autoRefillSuspended).toBe(false);
  });

  it('does not admit a late fetch after cancellation, and recovers interrupted refill state on restart', async () => {
    let resolve!: (record: LocalCase) => void;
    trainer = new LocalTrainer(
      store,
      () =>
        new Promise<LocalCase>((done) => {
          resolve = done;
        }),
      join(directory, 'journal'),
    );
    const task = trainer.startFill({ basePeriod: '5m', count: 1 });
    const recovered = new TrainerStore(directory);
    expect(recovered.metadata.task?.status).toBe('aborted');
    trainer.abortFill({ id: task.id });
    resolve(fixedCase());
    await new Promise((done) => setImmediate(done));
    expect(trainer.getFill().task?.status).toBe('aborted');
    expect(trainer.fill.pool().total).toBe(0);
  });
});
