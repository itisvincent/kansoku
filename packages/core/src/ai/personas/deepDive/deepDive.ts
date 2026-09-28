import { join } from 'node:path';
import type { DeepDiveStartResult, DeepDiveState } from '@kansoku/pro-api';
import type { NewsItem, RawBar } from '@kansoku/shared/types';
import { PROJECT_ROOT, STOCKS_DIR, skillSearchDirs } from '../../../platform/env.js';
import { ClientError } from '../../../platform/errors.js';
import { getProvider } from '../../../marketdata/registry.js';
import { marketOf, noteFileName } from '../../../symbols/symbol.utils.js';
import { easternDate } from '../../../marketdata/session.js';
import { AgentTimeoutError, createAgentSession, type AiAgentFactory } from '../../agents/agentSession.js';
import type { ExecFn } from '../../agents/agentTools/execTool.js';
import { buildResearchTools } from '../../agents/agentTools/researchTools.js';
import { buildKlineTool, buildNewsTool } from '../../agents/dataTools.js';
import { loadSkillIndex, readSkill } from '../../agents/skills.js';
import { MessagesEngine } from '../../conversation/messages/messageEngine.js';
import { SkillCatalogProvider, toSkillContexts } from '../../conversation/messages/sharedProviders.js';
import { aiConfig, type AiModel } from '../../runtime/models.js';
import { composeWithDiscipline, DisciplineMissingError, loadAppDiscipline } from '../../runtime/promptPolicy.js';
import { DEEP_DIVE_CLI_MAP, DEEP_DIVE_RETRY_PROMPT, deepDiveAdapterPrompt } from '../../runtime/prompts.js';
import { getInterfaceLocale } from '../../../settings/interfaceLocale.js';
import { emitNotice } from '../notices.js';
import { buildWriteNoteTool } from './noteTool.js';

export const DEEP_DIVE_SKILL = 'stock-deep-dive';
const DEFAULT_TIMEOUT_MS = 15 * 60_000;

export interface DeepDiveDeps {
  model: AiModel;
  repoRoot: string;
  stocksDir: string;
  agentFactory?: AiAgentFactory;
  exec?: ExecFn;
  timeoutMs?: number;
  now?: () => number;
  skillText?: string;
  disciplineText?: string;
  webSearchConfigured?: boolean;
  fetchNews: (symbol: string) => Promise<NewsItem[]>;
  fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
}

export interface DeepDiveOutcome {
  ok: boolean;
  error?: string;
}

export function buildDeepDiveSystemPrompt(disciplineText: string, skillText: string): string {
  const own = [
    deepDiveAdapterPrompt(),
    '',
    DEEP_DIVE_CLI_MAP,
    '',
    `<skill name="${DEEP_DIVE_SKILL}">`,
    skillText,
    '</skill>',
  ].join('\n');
  return composeWithDiscipline(disciplineText, own);
}

/** Runs one deep dive to completion. Never throws: failures come back as { ok: false }. */
export async function executeDeepDive(symbol: string, deps: DeepDiveDeps): Promise<DeepDiveOutcome> {
  const skillIndex = loadSkillIndex(skillSearchDirs(deps.repoRoot), {
    repoRoot: deps.repoRoot,
    runtime: 'app',
  });
  const skillText = deps.skillText ?? readSkill(skillIndex, DEEP_DIVE_SKILL);
  if (!skillText) return { ok: false, error: `${DEEP_DIVE_SKILL} skill is missing` };
  const disciplineText = deps.disciplineText ?? loadAppDiscipline(deps.repoRoot);
  if (!disciplineText) return { ok: false, error: new DisciplineMissingError().message };

  const noteName = noteFileName(symbol);
  let written = false;
  const { tools: researchTools } = await buildResearchTools({
    repoRoot: deps.repoRoot,
    exec: deps.exec,
    skillIndex,
    ...(deps.webSearchConfigured === undefined ? {} : { webSearchConfigured: deps.webSearchConfigured }),
  });
  const tools = [
    ...researchTools,
    buildNewsTool(symbol, deps.fetchNews),
    buildKlineTool(symbol, deps.fetchKline),
    buildWriteNoteTool({
      notePath: join(deps.stocksDir, `${noteName}.md`),
      onWritten: () => {
        written = true;
      },
    }),
  ];
  const engine = new MessagesEngine([new SkillCatalogProvider(toSkillContexts(skillIndex))]);
  const now = deps.now ?? (() => Date.now());
  const session = createAgentSession({
    layer: 'analyst',
    origin: 'deep-dive',
    symbol,
    model: deps.model,
    systemPrompt: buildDeepDiveSystemPrompt(disciplineText, skillText),
    tools,
    sessionId: `deep-dive:${symbol}:${now()}`,
    transformContext: engine.transformContext,
    agentFactory: deps.agentFactory,
  });
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const today = easternDate(new Date(now()));

  try {
    await session.runTurn(
      `Run the six-lens deep dive for ${symbol} (US Eastern date ${today}). Read the existing note at stocks/${noteName}.md first if it exists, then save the updated note with write_note.`,
      timeoutMs,
    );
    if (!written && !session.agent.state?.errorMessage) {
      await session.runTurn(DEEP_DIVE_RETRY_PROMPT, timeoutMs);
    }
  } catch (error) {
    if (error instanceof AgentTimeoutError) {
      return { ok: false, error: `deep dive timed out after ${Math.round(timeoutMs / 60_000)} min` };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (written) return { ok: true };
  const reason = session.agent.state?.errorMessage;
  return { ok: false, error: reason ? `model error: ${reason}` : 'the note was not saved' };
}

let state: DeepDiveState = { running: false };

export function deepDiveStatus(): DeepDiveState {
  return state;
}

export function resetDeepDiveForTests(): void {
  state = { running: false };
}

function announce(symbol: string, outcome: DeepDiveOutcome): void {
  const en = getInterfaceLocale() === 'en-US';
  emitNotice({
    symbol,
    kind: outcome.ok ? 'deep_dive_done' : 'deep_dive_failed',
    title: outcome.ok
      ? en ? `${symbol} deep research finished` : `${symbol} 深度研究完成`
      : en ? `${symbol} deep research failed` : `${symbol} 深度研究失败`,
    body: outcome.ok
      ? en ? 'The stock note was updated.' : '个股笔记已更新。'
      : (outcome.error ?? ''),
    at: new Date().toISOString(),
  });
}

/** An unreadable settings store means nothing is configured, not a crash. */
function configuredDeepDiveModel(): AiModel | null {
  try {
    return aiConfig().deepDiveModel;
  } catch {
    return null;
  }
}

function defaultDeps(model: AiModel): DeepDiveDeps {
  return {
    model,
    repoRoot: PROJECT_ROOT,
    stocksDir: STOCKS_DIR,
    fetchNews: (sym) => getProvider(marketOf(sym)).getNews(sym),
    fetchKline: (sym, period, count) => getProvider(marketOf(sym)).getKline(sym, period, count),
  };
}

/**
 * Starts the open-core deep dive in the background. One at a time across all symbols,
 * because each run drives many CLI calls and a long model session.
 * Throws 409 when busy and 503 when no deep-research model is configured, so HTTP and IPC
 * callers see the same status codes.
 */
export function startDeepDive(
  symbol: string,
  overrides: Partial<DeepDiveDeps> & { resolveModel?: () => AiModel | null } = {},
): { result: DeepDiveStartResult; done: Promise<void> } {
  if (state.running) {
    throw new ClientError('a deep dive is already running', `running: ${state.symbol ?? ''}`, 409);
  }
  const { resolveModel = configuredDeepDiveModel, ...rest } = overrides;
  const model = rest.model ?? resolveModel();
  if (!model) {
    throw new ClientError(
      'no deep-research model is configured',
      'set the Deep research role (or the primary model) in Settings → AI',
      503,
    );
  }
  const deps: DeepDiveDeps = { ...defaultDeps(model), ...rest, model };
  const startedAt = new Date((deps.now ?? Date.now)()).toISOString();
  const lastResult = state.lastResult;
  state = { running: true, symbol, startedAt, ...(lastResult ? { lastResult } : {}) };

  const done = executeDeepDive(symbol, deps)
    .catch((error: unknown): DeepDiveOutcome => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }))
    .then((outcome) => {
      state = {
        running: false,
        lastResult: {
          symbol,
          ok: outcome.ok,
          finishedAt: new Date().toISOString(),
          ...(outcome.error ? { error: outcome.error } : {}),
        },
      };
      announce(symbol, outcome);
    });
  return { result: { started: true }, done };
}
