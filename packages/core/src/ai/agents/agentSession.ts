import { randomUUID } from 'node:crypto';
import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from '@earendil-works/pi-agent-core';
import { getModelsRuntime } from '../runtime/modelsRuntime.js';
import type { AiModel } from '../runtime/models.js';
import { attachAiUsageLogger, type AiUsageLogContext } from '../runtime/usage.js';

function isOpenRouterUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === 'openrouter.ai';
  } catch {
    return false;
  }
}

function withOpenRouterSessionAffinity<Model extends { baseUrl: string; compat?: object }>(
  model: Model,
): Model {
  return {
    ...model,
    compat: {
      ...model.compat,
      sendSessionAffinityHeaders: true,
      sessionAffinityFormat: 'openrouter',
    },
  } as Model;
}

export const runtimeStreamFn: StreamFn = (model, context, options) => {
  const requestModel =
    options?.sessionId && isOpenRouterUrl(model.baseUrl)
      ? withOpenRouterSessionAffinity(model)
      : model;
  return getModelsRuntime().streamSimple(requestModel, context, options);
};

export type AiAgentPrompt = string | AgentMessage;

export function promptText(input: AiAgentPrompt): string {
  if (typeof input === 'string') return input;
  const content: unknown = 'content' in input ? input.content : undefined;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block: { text?: unknown }) => (typeof block.text === 'string' ? block.text : ''))
    .join('');
}

export interface AiAgentHandle {
  prompt(input: AiAgentPrompt): Promise<unknown>;
  continue?(): Promise<unknown>;
  abort(): void;
  setTools?(tools: AgentTool[]): void;
  subscribe?(listener: (event: AgentEvent) => void): () => void;
  state?: { messages: AgentMessage[]; errorMessage?: string };
}

export type AiAgentFactory = (config: {
  systemPrompt: string;
  model: AiModel;
  tools: AgentTool[];
  messages?: AgentMessage[];
  sessionId: string;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
}) => AiAgentHandle;

export class AgentTimeoutError extends Error {}

const NETWORK_RETRIES = 5;
const NETWORK_BACKOFF_MS = 1000;
const NETWORK_ERROR =
  /network|econnreset|etimedout|enotfound|econnrefused|eai_again|socket|fetch failed|undici|429|502|503|504|rate.?limit|too many requests|cloud_unavailable|流式响应中断|上游断|暂时不可用|过于频繁/i;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAbortError(err: unknown): boolean {
  return /abort/i.test(errorText(err));
}

function isRetryableNetworkError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (code === 'network_error' || code === 'rate_limited' || code === 'cloud_unavailable') {
      return true;
    }
    if (typeof code === 'string' && /^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR)/i.test(code)) {
      return true;
    }
  }
  return NETWORK_ERROR.test(errorText(err));
}

/** Resolves after `ms`, or as soon as `signal` aborts, so a stopped turn is not held up. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/** Thrown when a turn was stopped (timeout or abort) while a network retry was pending. */
function stoppedError(): Error {
  return new Error('aborted: the turn was stopped before the network retry');
}

/**
 * A failed provider call leaves an empty assistant message (stopReason "error") at the end of
 * the transcript, and continue() refuses to resume from an assistant message. Drop that
 * placeholder so the retry resumes from the last user or tool-result message.
 */
export function dropFailedTail(agent: AiAgentHandle): void {
  const state = agent.state;
  if (!state) return;
  let end = state.messages.length;
  while (end > 0) {
    const last = state.messages[end - 1] as { role?: string; stopReason?: string };
    const failed = last.stopReason === 'error' || last.stopReason === 'aborted';
    if (last.role !== 'assistant' || !failed) break;
    end -= 1;
  }
  if (end !== state.messages.length) state.messages = state.messages.slice(0, end);
}

async function retryNetwork(
  agent: AiAgentHandle,
  first: unknown,
  stop?: AbortSignal,
): Promise<void> {
  let last = first;
  for (let attempt = 0; attempt < NETWORK_RETRIES; attempt++) {
    await sleep(NETWORK_BACKOFF_MS * 2 ** attempt, stop);
    // A timed-out or aborted turn has already been reported as over; restarting the agent
    // here would run tools (and spend tokens) behind the caller's back.
    if (stop?.aborted) throw stoppedError();
    try {
      dropFailedTail(agent);
      await agent.continue!();
      if (!agent.state?.errorMessage) return;
      last = new Error(agent.state.errorMessage);
      if (stop?.aborted) throw stoppedError();
      if (!isRetryableNetworkError(last)) throw last;
    } catch (err) {
      if (isAbortError(err) || !isRetryableNetworkError(err)) throw err;
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function runUntilSettled(
  agent: AiAgentHandle,
  prompt: AiAgentPrompt,
  stop?: AbortSignal,
): Promise<void> {
  try {
    await agent.prompt(prompt);
  } catch (err) {
    if (!agent.continue || stop?.aborted || !isRetryableNetworkError(err)) throw err;
    await retryNetwork(agent, err, stop);
    return;
  }
  if (
    agent.continue &&
    !stop?.aborted &&
    agent.state?.errorMessage &&
    isRetryableNetworkError(new Error(agent.state.errorMessage))
  ) {
    await retryNetwork(agent, new Error(agent.state.errorMessage), stop);
  }
}

const defaultAgentFactory: AiAgentFactory = (config) => {
  const agent = new Agent({
    streamFn: runtimeStreamFn,
    initialState: {
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
      ...(config.model.thinkingLevel ? { thinkingLevel: config.model.thinkingLevel } : {}),
      ...(config.messages ? { messages: config.messages } : {}),
    },
    sessionId: config.sessionId,
    transformContext: config.transformContext,
  });
  return {
    prompt: (input: AiAgentPrompt) =>
      typeof input === 'string' ? agent.prompt(input) : agent.prompt(input),
    continue: () => agent.continue(),
    abort: () => agent.abort(),
    setTools: (tools) => {
      agent.state.tools = tools;
    },
    subscribe: (listener: Parameters<Agent['subscribe']>[0]) => agent.subscribe(listener),
    state: agent.state,
  };
};

export function createAgentSession(config: {
  layer: AiUsageLogContext['layer'];
  symbol: string;
  origin?: string;
  model: AiModel;
  systemPrompt: string;
  tools: AgentTool[];
  messages?: AgentMessage[];
  sessionId?: string;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  agentFactory?: AiAgentFactory;
  onEvent?: (event: AgentEvent) => void;
  persistUsage?: boolean;
}): {
  agent: AiAgentHandle;
  runTurn(prompt: AiAgentPrompt, timeoutMs?: number): Promise<void>;
  isDone(): boolean;
} {
  const factory = config.agentFactory ?? defaultAgentFactory;
  const sessionId = config.sessionId ?? `${config.layer}:${randomUUID()}`;
  const rawAgent = factory({
    systemPrompt: config.systemPrompt,
    model: config.model,
    tools: config.tools,
    messages: config.messages,
    sessionId,
    transformContext: config.transformContext,
  });

  // Callers stop a turn with agent.abort() (chat's Stop button) and the timer below does the
  // same. Both must also cancel a network retry that is waiting to restart the agent.
  let turnStop = new AbortController();
  const agent: AiAgentHandle = {
    ...rawAgent,
    get state() {
      return rawAgent.state;
    },
    abort: () => {
      turnStop.abort();
      rawAgent.abort();
    },
  };

  attachAiUsageLogger(agent, {
    layer: config.layer,
    symbol: config.symbol,
    model: config.model,
    ...(config.origin ? { origin: config.origin } : {}),
    persistUsage: config.persistUsage,
  });

  if (config.onEvent) agent.subscribe?.(config.onEvent);

  let done = false;
  let inFlight = false;

  async function runTurn(prompt: AiAgentPrompt, timeoutMs?: number): Promise<void> {
    if (inFlight) {
      throw new Error('agent session turn already in flight');
    }
    inFlight = true;
    done = false;
    turnStop = new AbortController();
    const stop = turnStop.signal;
    try {
      if (timeoutMs == null || timeoutMs <= 0) {
        await runUntilSettled(agent, prompt, stop);
        done = true;
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          agent.abort();
          reject(new AgentTimeoutError(`timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        // Same network retry as the untimed path; the timer still bounds the whole turn, and
        // agent.abort() above also cancels any retry that is still waiting.
        runUntilSettled(agent, prompt, stop).then(
          () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve();
          },
          (err) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(err instanceof Error ? err : new Error(String(err)));
          },
        );
      });
    } finally {
      inFlight = false;
    }
  }

  return {
    agent,
    runTurn,
    isDone: () => done,
  };
}
