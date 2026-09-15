import { createHash, randomInt, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  TrainerApi,
  TrainerAmendCheck,
  TrainerErrorCode,
  TrainerStepEvent,
  TrainerStepResult,
} from '@kansoku/pro-api';
import {
  advanceEpisode,
  checkEpisodeAmendment,
  createEpisodeState,
  EpisodeGuardrailError,
  submitEpisode,
  type EpisodeAdvanceResult,
} from './episode.js';
import { TrainerFill, type CaseLoader } from './fill.js';
import type { LocalCase, LocalSession } from './model.js';
import { buildReview } from './review.js';
import { buildStats } from './stats.js';
import { TrainerStore } from './store.js';
import {
  actionSchema,
  amendSchema,
  basePeriodSchema,
  sessionInput,
  sizeSchema,
  submissionSchema,
} from './validation.js';
import { sessionView } from './view.js';

export class TrainerError extends Error {
  constructor(
    message: string,
    readonly code: TrainerErrorCode = 'TRAINER_PROTOCOL',
    readonly status = 400,
  ) {
    super(message);
  }
}

const quietEvents = new Set(['observed', 'waiting_fill', 'holding']);

export class LocalTrainer implements TrainerApi {
  readonly fill: TrainerFill;

  constructor(
    readonly store: TrainerStore,
    loadCase: CaseLoader,
    private readonly journalDirectory: string,
  ) {
    this.fill = new TrainerFill(store, loadCase);
  }

  private read(input: { sessionId: string }): [LocalSession, LocalCase] {
    const { sessionId } = sessionInput.parse(input);
    const session = this.store.sessions.get(sessionId);
    const record = session && this.store.cases.get(session.caseId);
    if (!session || !record)
      throw new TrainerError('Training session was not found', 'TRAINER_PROTOCOL', 404);
    return [session, record];
  }

  private settled(input: { sessionId: string }): [LocalSession, LocalCase] {
    const pair = this.read(input);
    if (pair[0].state.phase !== 'terminal') {
      throw new TrainerError('Finish the session before revealing its identity or future candles');
    }
    return pair;
  }

  listPool() {
    const result = this.fill.pool();
    this.fill.maybeRefill('5m', 'pool-read');
    return result;
  }

  getFill() {
    return this.fill.state();
  }

  startFill(input: Parameters<TrainerApi['startFill']>[0]) {
    const { basePeriod, count } = z
      .object({ basePeriod: basePeriodSchema, count: z.number().int().min(1).max(20) })
      .parse(input);
    return this.fill.start(basePeriod, count, 'manual');
  }

  abortFill(input: Parameters<TrainerApi['abortFill']>[0]) {
    return this.fill.abort(z.object({ id: z.uuid() }).parse(input).id);
  }

  setAutoRefill(input: Parameters<TrainerApi['setAutoRefill']>[0]) {
    return this.fill.setEnabled(z.object({ enabled: z.boolean() }).parse(input).enabled);
  }

  open(input: Parameters<TrainerApi['open']>[0]) {
    const { basePeriod } = z.object({ basePeriod: basePeriodSchema }).parse(input);
    // Reopening the singleton training window resumes its last unfinished board.
    const unfinished = [...this.store.sessions.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .find(
        (session) =>
          session.state.phase !== 'terminal' &&
          this.store.cases.get(session.caseId)?.basePeriod === basePeriod,
      );
    if (unfinished) return this.resume({ sessionId: unfinished.id });
    const used = new Set([...this.store.sessions.values()].map((session) => session.caseId));
    const available = [...this.store.cases.values()].filter(
      (record) => record.basePeriod === basePeriod && !used.has(record.id),
    );
    if (!available.length) {
      this.fill.maybeRefill(basePeriod, 'pool-read');
      throw new TrainerError('No training cases are ready yet', 'TRAINER_POOL_EMPTY', 409);
    }
    const record = available[randomInt(available.length)];
    const now = new Date().toISOString();
    const session: LocalSession = {
      id: randomUUID(),
      caseId: record.id,
      state: createEpisodeState(),
      lesson: null,
      openedAt: now,
      updatedAt: now,
      fastForwardTrades: [],
    };
    const view = sessionView(session, record);
    this.store.saveSession(session);
    return { sessionId: session.id, view };
  }

  resume(input: Parameters<TrainerApi['resume']>[0]) {
    const [session, record] = this.read(input);
    return { sessionId: session.id, view: sessionView(session, record) };
  }

  private commit(
    session: LocalSession,
    record: LocalCase,
    result: EpisodeAdvanceResult,
  ): TrainerStepResult {
    const advancedBars = result.state.cursor - session.state.cursor;
    const next = { ...session, state: result.state, updatedAt: new Date().toISOString() };
    const view = sessionView(next, record);
    const events: TrainerStepEvent[] = quietEvents.has(result.event)
      ? []
      : [
          {
            barOffset: advancedBars,
            cursor: result.state.cursor,
            at: result.asOf,
            event: result.event,
          },
        ];
    this.store.saveSession(next);
    if (result.terminal) {
      // Refill failure cannot discard an already committed settlement.
      try {
        this.fill.maybeRefill(record.basePeriod, 'session-end');
      } catch (error) {
        console.error('[trainer] automatic refill failed', error);
      }
    }
    return { view, events, advancedBars, terminal: result.terminal, result: result.result };
  }

  submit(input: Parameters<TrainerApi['submit']>[0]) {
    const [session, record] = this.read(input);
    const submission = submissionSchema.parse(input.submission);
    const mode = z.enum(['market', 'limit']).parse(input.entryMode);
    const size = sizeSchema.optional().parse(input.size);
    const submitted = submitEpisode(session.state, record.question, submission, {}, mode, size);
    // Market tickets execute at the next open; limit tickets stay pending until a step.
    const result =
      mode === 'market' && submission.direction !== 'neutral'
        ? advanceEpisode(submitted.state, record.question, {
            type: 'hold',
            reason: submission.decision_reason ?? {
              category: 'other',
              summary: 'No trading reason provided.',
            },
          })
        : submitted;
    return this.commit(session, record, result);
  }

  step(input: Parameters<TrainerApi['step']>[0]) {
    const [session, record] = this.read(input);
    const action = actionSchema.parse(input.action);
    const bars = z.number().int().min(1).max(20).optional().parse(input.bars);
    if (bars != null && action.type !== 'hold')
      throw new TrainerError('Only hold can advance multiple bars');
    const resolved = action.type === 'hold' && bars != null ? { ...action, bars } : action;
    const result = advanceEpisode(session.state, record.question, resolved);
    const fast =
      resolved.type === 'hold' &&
      ((resolved.bars ?? 1) > 1 ||
        (resolved.period != null &&
          resolved.period !== 'h1' &&
          resolved.period !== record.basePeriod));
    const tradeId = session.state.position?.tradeId ?? session.state.order?.tradeId;
    const next =
      fast && tradeId != null
        ? {
            ...session,
            fastForwardTrades: [...new Set([...session.fastForwardTrades, tradeId])],
          }
        : session;
    return this.commit(next, record, result);
  }

  amend(input: Parameters<TrainerApi['amend']>[0]) {
    return this.step({
      sessionId: input?.sessionId,
      action: { type: 'amend', stop: input?.stop, target: input?.target, reason: input?.reason },
    });
  }

  validateAmend(input: Parameters<TrainerApi['validateAmend']>[0]): TrainerAmendCheck {
    const [session, record] = this.read(input);
    const amendment = amendSchema.parse(input);
    try {
      checkEpisodeAmendment(session.state, record.question, amendment);
      return { allowed: true, code: null, error: null };
    } catch (error) {
      return {
        allowed: false,
        code: error instanceof EpisodeGuardrailError ? 'TRAINER_GUARDRAIL' : 'TRAINER_PROTOCOL',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  cancel(input: Parameters<TrainerApi['cancel']>[0]) {
    return this.step({
      sessionId: input?.sessionId,
      action: { type: 'cancel', reason: input?.reason },
    });
  }

  exitNextOpen(input: Parameters<TrainerApi['exitNextOpen']>[0]) {
    return this.step({
      sessionId: input?.sessionId,
      action: { type: 'exit_next_open', reason: input?.reason },
    });
  }

  add(input: Parameters<TrainerApi['add']>[0]) {
    return this.step({
      sessionId: input?.sessionId,
      action: { type: 'add', size: input?.size, reason: input?.reason },
    });
  }

  reduce(input: Parameters<TrainerApi['reduce']>[0]) {
    return this.step({
      sessionId: input?.sessionId,
      action: { type: 'reduce', size: input?.size, reason: input?.reason },
    });
  }

  reveal(input: Parameters<TrainerApi['reveal']>[0]) {
    const [, record] = this.settled(input);
    return { provenance: record.provenance, epilogue: record.epilogue };
  }

  review(input: Parameters<TrainerApi['review']>[0]) {
    return buildReview(...this.settled(input));
  }

  stats() {
    return buildStats([...this.store.sessions.values()], this.store.cases);
  }

  coach(input: Parameters<TrainerApi['coach']>[0]): never {
    this.read(input);
    throw new TrainerError(
      'AI coaching is not included in this local trainer. You can continue replaying and paper trading.',
      'TRAINER_PROTOCOL',
      501,
    );
  }

  annotate(input: Parameters<TrainerApi['annotate']>[0]): never {
    this.settled(input);
    throw new TrainerError(
      'There is no AI coaching call to annotate in this local trainer',
      'TRAINER_PROTOCOL',
      501,
    );
  }

  saveLesson(input: Parameters<TrainerApi['saveLesson']>[0]) {
    const [session] = this.settled(input);
    const text = z.string().trim().min(1).max(4000).parse(input.text);
    if (session.lesson?.text === text) return session.lesson;
    const lesson = { text, writtenAt: new Date().toISOString(), syncedAt: null };
    this.store.saveSession({ ...session, lesson });
    return lesson;
  }

  syncLesson(input: Parameters<TrainerApi['syncLesson']>[0]) {
    const [session] = this.settled(input);
    if (!session.lesson) throw new TrainerError('Save a lesson before syncing it');
    if (session.lesson.syncedAt) return session.lesson;
    mkdirSync(this.journalDirectory, { recursive: true });
    const file = join(this.journalDirectory, 'lessons.md');
    const digest = createHash('sha256').update(session.lesson.text).digest('hex').slice(0, 16);
    const marker = `<!-- local-training:${session.id}:${digest} -->`;
    let content = '';
    try {
      content = readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const now = new Date().toISOString();
    if (!content.includes(marker)) {
      appendFileSync(
        file,
        `\n- ${now.slice(0, 10)} 盲盘训练：${session.lesson.text.replace(/\s+/g, ' ')} ${marker}\n`,
        'utf8',
      );
    }
    const lesson = { ...session.lesson, syncedAt: now };
    this.store.saveSession({ ...session, lesson });
    return lesson;
  }
}
