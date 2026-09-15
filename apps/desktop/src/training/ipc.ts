import { IpcMethod, IpcService } from 'electron-ipc-decorator';
import { ZodError } from 'zod';
import type {
  TrainerApi,
  TrainerEnvelope,
  TrainerView,
  WrapTrainerEnvelope,
} from '@kansoku/pro-api';
import { EpisodeGuardrailError } from './episode.js';
import { TrainerError } from './runtime.js';
import { getLocalTrainer } from './instance.js';

async function envelope<T>(
  run: () => T,
  input?: { sessionId: string },
): Promise<TrainerEnvelope<T>> {
  try {
    return { ok: true, data: run() };
  } catch (error) {
    let view: TrainerView | null = null;
    if (input?.sessionId) {
      try {
        view = getLocalTrainer().resume(input).view;
      } catch {
        /* Unknown or malformed session. */
      }
    }
    const code =
      error instanceof EpisodeGuardrailError
        ? 'TRAINER_GUARDRAIL'
        : error instanceof TrainerError
          ? error.code
          : 'TRAINER_PROTOCOL';
    return {
      ok: false,
      code,
      error:
        error instanceof ZodError
          ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
          : error instanceof Error
            ? error.message
            : String(error),
      status: error instanceof TrainerError ? error.status : 400,
      ...(view ? { view } : {}),
    };
  }
}

export class LocalTrainerIpc extends IpcService implements WrapTrainerEnvelope<TrainerApi> {
  static readonly groupName = 'trainer';

  @IpcMethod()
  listPool() {
    return envelope(() => getLocalTrainer().listPool());
  }

  @IpcMethod()
  getFill() {
    return envelope(() => getLocalTrainer().getFill());
  }

  @IpcMethod()
  startFill(input: Parameters<TrainerApi['startFill']>[0]) {
    return envelope(() => getLocalTrainer().startFill(input));
  }

  @IpcMethod()
  abortFill(input: Parameters<TrainerApi['abortFill']>[0]) {
    return envelope(() => getLocalTrainer().abortFill(input));
  }

  @IpcMethod()
  setAutoRefill(input: Parameters<TrainerApi['setAutoRefill']>[0]) {
    return envelope(() => getLocalTrainer().setAutoRefill(input));
  }

  @IpcMethod()
  open(input: Parameters<TrainerApi['open']>[0]) {
    return envelope(() => getLocalTrainer().open(input));
  }

  @IpcMethod()
  resume(input: Parameters<TrainerApi['resume']>[0]) {
    return envelope(() => getLocalTrainer().resume(input), input);
  }

  @IpcMethod()
  submit(input: Parameters<TrainerApi['submit']>[0]) {
    return envelope(() => getLocalTrainer().submit(input), input);
  }

  @IpcMethod()
  step(input: Parameters<TrainerApi['step']>[0]) {
    return envelope(() => getLocalTrainer().step(input), input);
  }

  @IpcMethod()
  amend(input: Parameters<TrainerApi['amend']>[0]) {
    return envelope(() => getLocalTrainer().amend(input), input);
  }

  @IpcMethod()
  validateAmend(input: Parameters<TrainerApi['validateAmend']>[0]) {
    return envelope(() => getLocalTrainer().validateAmend(input), input);
  }

  @IpcMethod()
  cancel(input: Parameters<TrainerApi['cancel']>[0]) {
    return envelope(() => getLocalTrainer().cancel(input), input);
  }

  @IpcMethod()
  exitNextOpen(input: Parameters<TrainerApi['exitNextOpen']>[0]) {
    return envelope(() => getLocalTrainer().exitNextOpen(input), input);
  }

  @IpcMethod()
  add(input: Parameters<TrainerApi['add']>[0]) {
    return envelope(() => getLocalTrainer().add(input), input);
  }

  @IpcMethod()
  reduce(input: Parameters<TrainerApi['reduce']>[0]) {
    return envelope(() => getLocalTrainer().reduce(input), input);
  }

  @IpcMethod()
  reveal(input: Parameters<TrainerApi['reveal']>[0]) {
    return envelope(() => getLocalTrainer().reveal(input), input);
  }

  @IpcMethod()
  coach(input: Parameters<TrainerApi['coach']>[0]) {
    return envelope(() => getLocalTrainer().coach(input), input);
  }

  @IpcMethod()
  annotate(input: Parameters<TrainerApi['annotate']>[0]) {
    return envelope(() => getLocalTrainer().annotate(input), input);
  }

  @IpcMethod()
  review(input: Parameters<TrainerApi['review']>[0]) {
    return envelope(() => getLocalTrainer().review(input), input);
  }

  @IpcMethod()
  stats() {
    return envelope(() => getLocalTrainer().stats());
  }

  @IpcMethod()
  saveLesson(input: Parameters<TrainerApi['saveLesson']>[0]) {
    return envelope(() => getLocalTrainer().saveLesson(input), input);
  }

  @IpcMethod()
  syncLesson(input: Parameters<TrainerApi['syncLesson']>[0]) {
    return envelope(() => getLocalTrainer().syncLesson(input), input);
  }
}
