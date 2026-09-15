import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LocalCase, LocalSession, TrainerMetadata } from './model.js';

const ID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export function writeJson(file: string, value: unknown): void {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, 'utf8');
  renameSync(temporary, file);
}

function readRecords<T extends { id: string }>(dir: string): Map<string, T> {
  const records = new Map<string, T>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json') || !ID.test(name.slice(0, -5))) continue;
    const record = JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
    if (record.id !== name.slice(0, -5)) throw new Error('Invalid saved training record');
    records.set(record.id, record);
  }
  return records;
}

export class TrainerStore {
  readonly cases: Map<string, LocalCase>;
  readonly sessions: Map<string, LocalSession>;
  metadata: TrainerMetadata;

  constructor(readonly directory: string) {
    mkdirSync(join(directory, 'cases'), { recursive: true });
    mkdirSync(join(directory, 'sessions'), { recursive: true });
    this.cases = readRecords(join(directory, 'cases'));
    this.sessions = readRecords(join(directory, 'sessions'));
    try {
      this.metadata = JSON.parse(readFileSync(join(directory, 'metadata.json'), 'utf8'));
      if (this.metadata.version !== 1) throw new Error('Unsupported training data version');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.metadata = {
        version: 1,
        task: null,
        autoRefillEnabled: true,
        autoRefillSuspended: false,
      };
    }
    if (this.metadata.task?.status === 'running') {
      const now = new Date().toISOString();
      this.saveMetadata({
        ...this.metadata,
        task: {
          ...this.metadata.task,
          status: 'aborted',
          activity: 'Refill interrupted by app restart',
          updatedAt: now,
          finishedAt: now,
        },
      });
    }
  }

  saveCase(record: LocalCase): void {
    if (!ID.test(record.id)) throw new Error('Invalid training case ID');
    writeJson(join(this.directory, 'cases', `${record.id}.json`), record);
    this.cases.set(record.id, record);
  }

  saveSession(session: LocalSession): void {
    if (!ID.test(session.id)) throw new Error('Invalid training session ID');
    // Commit to memory only after the atomic disk write succeeds.
    writeJson(join(this.directory, 'sessions', `${session.id}.json`), session);
    this.sessions.set(session.id, session);
  }

  saveMetadata(metadata: TrainerMetadata): void {
    writeJson(join(this.directory, 'metadata.json'), metadata);
    this.metadata = metadata;
  }
}
