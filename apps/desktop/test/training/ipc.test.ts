import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainerEnvelope, TrainerOpened, TrainerStepResult } from '@kansoku/pro-api';
import { LocalTrainer } from '../../src/training/runtime.js';
import { TrainerStore } from '../../src/training/store.js';
import { fixedCase, prediction, reason } from './fixtures.js';

type Handler = (event: unknown, input?: unknown) => Promise<unknown>;
const context = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  runtime: null as LocalTrainer | null,
  localBuild: true,
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => context.handlers.set(channel, handler),
  },
}));
vi.mock('@kansoku/core/license/licenseGate', () => ({
  isLocalTestBuildBaked: () => context.localBuild,
}));
vi.mock('../../src/training/instance.js', () => ({
  getLocalTrainer: () => context.runtime!,
  disposeLocalTrainer: () => context.runtime?.fill.dispose(),
}));

describe('local edition trainer IPC registration', () => {
  let directory: string;

  beforeEach(async () => {
    context.localBuild = true;
    directory = mkdtempSync(join(tmpdir(), 'kansoku-trainer-ipc-'));
    const store = new TrainerStore(directory);
    store.saveCase(fixedCase());
    context.runtime = new LocalTrainer(store, vi.fn(), join(directory, 'journal'));
    context.runtime.setAutoRefill({ enabled: false });
  });

  afterEach(() => {
    context.runtime?.fill.dispose();
    rmSync(directory, { recursive: true, force: true });
  });

  async function boot() {
    const { loadProComposition } = await import('../../src/edition/pro.js');
    const composition = await loadProComposition();
    const { createServices } = await import('electron-ipc-decorator');
    createServices([...(composition?.ipcServices ?? [])]);
    return composition;
  }

  async function invoke<T>(method: string, input?: unknown): Promise<TrainerEnvelope<T>> {
    const handler = context.handlers.get(`trainer.${method}`);
    if (!handler) throw new Error(`No handler registered for 'trainer.${method}'`);
    return (await handler({ sender: {} }, input)) as TrainerEnvelope<T>;
  }

  it('boots the local composition and opens a playable session through the actual registered handler', async () => {
    await boot();
    const opened = await invoke<TrainerOpened>('open', { basePeriod: '5m' });
    expect(opened).toMatchObject({
      ok: true,
      data: {
        sessionId: expect.any(String),
        view: { symbol: 'ASSET123.SIM', phase: 'flat', remainingBars: 5 },
      },
    });
    expect(context.handlers.size).toBe(22);
    if (!opened.ok) throw new Error(opened.error);
    const sessionId = opened.data.sessionId;
    const trade = await invoke<TrainerStepResult>('submit', {
      sessionId,
      submission: prediction(),
      entryMode: 'market',
      size: 0.5,
    });
    expect(trade).toMatchObject({ ok: true, data: { view: { phase: 'open', cursor: 0 } } });
    const denied = await invoke('amend', { sessionId, stop: 80, reason });
    expect(denied).toMatchObject({ ok: false, code: 'TRAINER_GUARDRAIL', view: { cursor: 0 } });
    expect(await invoke('reveal', { sessionId })).toMatchObject({
      ok: false,
      code: 'TRAINER_PROTOCOL',
    });
    expect(await invoke('open', { basePeriod: 'bogus' })).toMatchObject({
      ok: false,
      code: 'TRAINER_PROTOCOL',
    });
  });

  it('registers fill updates so the waiting window can open itself when real cases arrive', async () => {
    const composition = await boot();
    const frames: string[] = [];
    const channel = composition!.realtimeChannels.find((item) => item.kind === 'training-fill')!;
    const detach = await channel.attach({}, (frame) => frames.push(frame));
    expect(JSON.parse(frames[0])).toMatchObject({
      type: 'init',
      state: { autoRefillEnabled: false },
    });
    await invoke('setAutoRefill', { enabled: true });
    expect(JSON.parse(frames.at(-1)!)).toMatchObject({
      type: 'init',
      state: { autoRefillEnabled: true },
    });
    detach();
  });

  it('keeps the normal free composition unchanged', async () => {
    context.localBuild = false;
    const before = context.handlers.size;
    expect(await boot()).toBeNull();
    expect(context.handlers.size).toBe(before);
  });
});
