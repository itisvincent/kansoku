import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalTrainer } from '../../src/training/runtime.js';
import { TrainerStore } from '../../src/training/store.js';
import { fixedCase, prediction, reason } from './fixtures.js';

describe('local training sessions', () => {
  let directory: string;
  let trainer: LocalTrainer;
  let store: TrainerStore;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'kansoku-trainer-'));
    store = new TrainerStore(join(directory, 'state'));
    store.saveCase(fixedCase());
    trainer = new LocalTrainer(store, vi.fn(), join(directory, 'journal'));
    trainer.setAutoRefill({ enabled: false });
  });

  afterEach(() => {
    trainer.fill.dispose();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reveals only the current bars and refuses early provenance and review requests', () => {
    const opened = trainer.open({ basePeriod: '5m' });
    expect(opened.view).toMatchObject({
      symbol: 'ASSET123.SIM',
      cursor: -1,
      remainingBars: 5,
      phase: 'flat',
    });
    expect(opened.view.bars.base).toHaveLength(1);
    for (const text of ['TEST.US', '2026-08-31', 'source-test', 'epilogue', 'replay']) {
      expect(JSON.stringify(opened)).not.toContain(text);
    }
    expect(() => trainer.reveal(opened)).toThrow('Finish the session');
    expect(() => trainer.review(opened)).toThrow('Finish the session');
    const step = trainer.step({ sessionId: opened.sessionId, action: { type: 'hold' } });
    expect(step).toMatchObject({
      advancedBars: 1,
      terminal: false,
      events: [],
      view: { cursor: 0 },
    });
    expect(step.view.bars.base).toHaveLength(2);
    expect(step.view.bars.base.at(-1)?.close).toBe(101);
    expect(step.view.bars.mid.at(-1)?.high).toBe(102);
    expect(step.view.bars.top.at(-1)?.high).toBe(102);
    expect(JSON.stringify(step)).not.toContain('09:35');
  });

  it('fills market orders at the next open and resumes the same state after restarting', () => {
    const opened = trainer.open({ basePeriod: '5m' });
    const submitted = trainer.submit({
      sessionId: opened.sessionId,
      submission: prediction(),
      entryMode: 'market',
      size: 0.25,
    });
    expect(submitted).toMatchObject({
      advancedBars: 1,
      events: [{ event: 'filled' }],
      view: {
        phase: 'open',
        cursor: 0,
        position: { entryPrice: 101, riskUnit: 11, lots: [{ remaining: 0.25 }] },
      },
    });
    const restarted = new LocalTrainer(
      new TrainerStore(join(directory, 'state')),
      vi.fn(),
      join(directory, 'journal'),
    );
    expect(restarted.resume(opened).view).toEqual(submitted.view);
    expect(restarted.open({ basePeriod: '5m' }).sessionId).toBe(opened.sessionId);
    expect(restarted.listPool().total).toBe(0);
    restarted.fill.dispose();
  });

  it('keeps limit orders pending, cancels without advancing, and rejects invalid input without changing state', () => {
    const opened = trainer.open({ basePeriod: '5m' });
    const submitted = trainer.submit({
      sessionId: opened.sessionId,
      submission: prediction(),
      entryMode: 'limit',
    });
    expect(submitted).toMatchObject({ advancedBars: 0, view: { phase: 'pending', cursor: -1 } });
    const cancelled = trainer.cancel({ sessionId: opened.sessionId, reason });
    expect(cancelled).toMatchObject({ advancedBars: 0, view: { phase: 'flat', cursor: -1 } });
    expect(() =>
      trainer.submit({
        sessionId: opened.sessionId,
        submission: prediction(),
        entryMode: 'market',
        size: NaN,
      }),
    ).toThrow();
    expect(() =>
      trainer.step({ sessionId: opened.sessionId, action: { type: 'hold', bars: 0 } }),
    ).toThrow();
    expect(trainer.resume(opened).view).toEqual(cancelled.view);
  });

  it('enforces amendments, add limits, partial exits and settlement using the replay engine', () => {
    const opened = trainer.open({ basePeriod: '5m' });
    const input = { sessionId: opened.sessionId };
    trainer.submit({ ...input, submission: prediction(), entryMode: 'market', size: 0.25 });
    expect(trainer.validateAmend({ ...input, stop: 85 })).toMatchObject({
      allowed: false,
      code: 'TRAINER_GUARDRAIL',
    });
    expect(() => trainer.amend({ ...input, stop: 85, reason })).toThrow('risk already committed');
    expect(() => trainer.add({ ...input, size: 1, reason })).toThrow('exceeds a full position');
    expect(trainer.resume(input).view.cursor).toBe(0);
    const added = trainer.add({ ...input, size: 0.25, reason });
    expect(added.view.position).toMatchObject({ entryPrice: 101.5, riskUnit: 11 });
    expect(added.view.position?.lots.reduce((sum, lot) => sum + lot.remaining, 0)).toBe(0.5);
    const reduced = trainer.reduce({ ...input, size: 0.25, reason });
    expect(reduced.view.position?.exits[0]).toMatchObject({ price: 103, size: 0.25 });
    const exited = trainer.exitNextOpen({ ...input, reason });
    expect(exited.view).toMatchObject({ phase: 'flat', cursor: 3 });
    expect(exited.view.trades).toHaveLength(1);
    const ended = trainer.step({ ...input, action: { type: 'hold' } });
    expect(ended).toMatchObject({ terminal: true, view: { phase: 'terminal', remainingBars: 0 } });
    const review = trainer.review(input);
    expect(review.provenance.sourceSymbol).toBe('TEST.US');
    expect(review.replay).toHaveLength(5);
    expect(review.epilogue).toHaveLength(1);
    expect(review.events.map((event) => event.kind)).toEqual([
      'entry',
      'entry',
      'manual_exit',
      'manual_exit',
    ]);
    expect(trainer.stats()).toMatchObject({
      completedSessions: 1,
      unfinishedSessions: 0,
      overview: { locked: true, winRate: null },
    });
  });

  it('stops a batch on a bracket exit before revealing the rest of the requested period', () => {
    const opened = trainer.open({ basePeriod: '5m' });
    trainer.submit({
      sessionId: opened.sessionId,
      submission: prediction({ entry_plan: { entry: 100, stop: 90, target1: 104 } }),
      entryMode: 'market',
    });
    const result = trainer.step({
      sessionId: opened.sessionId,
      action: { type: 'hold', bars: 5, reason },
    });
    expect(result).toMatchObject({
      advancedBars: 2,
      events: [{ event: 'target_hit' }],
      view: { cursor: 2, phase: 'flat', remainingBars: 2 },
    });
    expect(result.view.trades[0].exit.price).toBe(104);
  });

  it('saves lessons locally and only syncs explicitly, without duplicate journal lines', () => {
    const opened = trainer.open({ basePeriod: '5m' });
    trainer.step({ sessionId: opened.sessionId, action: { type: 'hold', bars: 5 } });
    trainer.saveLesson({ sessionId: opened.sessionId, text: 'Respect the planned stop.' });
    expect(() => readFileSync(join(directory, 'journal', 'lessons.md'))).toThrow();
    const first = trainer.syncLesson(opened);
    expect(trainer.syncLesson(opened)).toEqual(first);
    expect(
      readFileSync(join(directory, 'journal', 'lessons.md'), 'utf8').match(
        /Respect the planned stop/g,
      ),
    ).toHaveLength(1);
    expect(trainer.review(opened).lesson?.syncedAt).toBeTruthy();
  });
});
