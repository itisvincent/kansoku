import { join } from 'node:path';
import { app } from 'electron';
import { getProvider } from '@kansoku/core/marketdata/registry';
import { JOURNAL_DIR } from '@kansoku/core/platform/env';
import { fetchLocalCase } from './source.js';
import { TrainerStore } from './store.js';
import { LocalTrainer } from './runtime.js';

let runtime: LocalTrainer | null = null;

export function getLocalTrainer(): LocalTrainer {
  return (runtime ??= new LocalTrainer(
    new TrainerStore(join(app.getPath('userData'), 'State', 'local-training')),
    (symbol, period, used, signal) =>
      fetchLocalCase(getProvider('US'), symbol, period, used, signal),
    JOURNAL_DIR,
  ));
}

export function disposeLocalTrainer(): void {
  runtime?.fill.dispose();
  runtime = null;
}
