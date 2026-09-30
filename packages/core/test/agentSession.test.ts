import type { AgentEvent, AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';
import { createModels, type MutableModels } from '@earendil-works/pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { Type } from 'typebox';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentTimeoutError,
  createAgentSession,
  runtimeStreamFn,
  type AiAgentFactory,
} from '../src/ai/agents/agentSession.js';
import { setModelsRuntimeForTests } from '../src/ai/runtime/modelsRuntime.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;

const fakeTool: AgentTool = {
  name: 'noop',
  description: 'noop',
  label: 'Noop',
  parameters: Type.Object({}),
  execute: async () => ({ content: [], details: {} }),
};

const fakeMessage: AgentMessage = { role: 'user', content: 'hi', timestamp: 0 };

describe('runtimeStreamFn', () => {
  afterEach(() => {
    setModelsRuntimeForTests(null);
  });

  it("delegates to the runtime's streamSimple with the same args", () => {
    const spy = vi.fn();
    setModelsRuntimeForTests({ streamSimple: spy } as unknown as MutableModels);

    const fakeContext = { messages: [] } as unknown as Parameters<typeof runtimeStreamFn>[1];
    const options = {
      apiKey: undefined,
      sessionId: 'business-session',
    } as unknown as Parameters<typeof runtimeStreamFn>[2];
    runtimeStreamFn(fakeModel, fakeContext, options);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(fakeModel, fakeContext, options);
  });

  it('throws when no runtime has been initialized', () => {
    expect(() => runtimeStreamFn(fakeModel, {} as never, undefined)).toThrow(/not initialized/);
  });

  it('sends the business session ID on OpenRouter requests', async () => {
    const requestHeaders: Headers[] = [];
    const models = createModels();
    models.setProvider(openrouterProvider());
    setModelsRuntimeForTests(models);
    const model = models.getModel('openrouter', 'openai/gpt-4o-mini');
    if (!model) throw new Error('missing OpenRouter test model');

    const stream = await runtimeStreamFn(
      model,
      {
        messages: [{ content: 'probe', role: 'user', timestamp: 1 }],
        systemPrompt: 'test',
        tools: [],
      },
      {
        apiKey: 'test-key',
        fetch: async (_input, init) => {
          requestHeaders.push(new Headers(init?.headers));
          return new Response(JSON.stringify({ error: { message: 'expected test stop' } }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400,
          });
        },
        sessionId: 'kansoku-session',
      },
    );

    await stream.result();

    expect(requestHeaders).toHaveLength(1);
    expect(requestHeaders[0]?.get('x-session-id')).toBe('kansoku-session');
  });
});

describe('createAgentSession', () => {
  it('passes systemPrompt/model/tools/messages verbatim to the factory', () => {
    let received: Parameters<AiAgentFactory>[0] | undefined;
    const agentFactory: AiAgentFactory = (config) => {
      received = config;
      return { prompt: async () => {}, abort: () => {} };
    };

    createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [fakeTool],
      messages: [fakeMessage],
      agentFactory,
    });

    expect(received?.systemPrompt).toBe('system prompt');
    expect(received?.model).toBe(fakeModel);
    expect(received?.tools).toEqual([fakeTool]);
    expect(received?.messages).toEqual([fakeMessage]);
    expect(received?.sessionId).toMatch(
      /^chat:[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu,
    );
  });

  it("forwards events emitted by the handle's subscribe to onEvent", () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const agentFactory: AiAgentFactory = () => ({
      prompt: async () => {},
      abort: () => {},
      subscribe: (l) => {
        listener = l;
        return () => {};
      },
    });

    const events: AgentEvent[] = [];
    createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
      onEvent: (event) => events.push(event),
    });

    const event: AgentEvent = { type: 'agent_start' };
    listener?.(event);
    expect(events).toEqual([event]);
  });

  it('resolves runTurn when the prompt resolves', async () => {
    const agentFactory: AiAgentFactory = () => ({
      prompt: async () => {},
      abort: () => {},
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    await expect(session.runTurn('hi', 1000)).resolves.toBeUndefined();
    expect(session.isDone()).toBe(true);
  });

  /**
   * Mirrors pi-agent-core: prompt() never throws; a failed provider call appends an empty
   * assistant message with stopReason "error", and continue() refuses to resume from it.
   */
  function realisticAgent(failures: number) {
    let calls = 0;
    const messages: AgentMessage[] = [];
    const state: { messages: AgentMessage[]; errorMessage?: string } = {
      get messages() {
        return messages.slice();
      },
      set messages(next) {
        messages.splice(0, messages.length, ...next);
      },
    };
    const attempt = () => {
      calls += 1;
      if (calls <= failures) {
        messages.push({ role: 'assistant', stopReason: 'error', content: [] } as unknown as AgentMessage);
        state.errorMessage = '429 Too Many Requests';
      } else {
        messages.push({ role: 'assistant', stopReason: 'stop', content: [] } as unknown as AgentMessage);
        state.errorMessage = undefined;
      }
    };
    const agent = {
      prompt: async () => {
        messages.push(fakeMessage);
        attempt();
      },
      continue: async () => {
        const last = messages.at(-1) as { role?: string } | undefined;
        if (last?.role === 'assistant') throw new Error('Cannot continue from message role: assistant');
        attempt();
      },
      abort: () => {},
      state,
    };
    return { agent, calls: () => calls, messages };
  }

  it('recovers from a provider error the way pi-agent-core reports it', async () => {
    vi.useFakeTimers();
    try {
      const fake = realisticAgent(1);
      const session = createAgentSession({
        layer: 'analyst',
        symbol: 'AVGO.US',
        model: fakeModel,
        systemPrompt: 'system prompt',
        tools: [],
        agentFactory: () => fake.agent,
      });
      const turn = session.runTurn('hi');
      await vi.advanceTimersByTimeAsync(1000);
      await turn;
      expect(fake.calls()).toBe(2);
      expect(fake.agent.state.errorMessage).toBeUndefined();
      // The failed placeholder is gone; only the prompt and the good reply remain.
      expect(fake.messages.map((m) => (m as { stopReason?: string }).stopReason ?? m.role)).toEqual([
        'user',
        'stop',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries network errors inside a timed turn too', async () => {
    vi.useFakeTimers();
    try {
      const fake = realisticAgent(2);
      const session = createAgentSession({
        layer: 'analyst',
        symbol: 'AVGO.US',
        model: fakeModel,
        systemPrompt: 'system prompt',
        tools: [],
        agentFactory: () => fake.agent,
      });
      const turn = session.runTurn('hi', 60_000);
      await vi.advanceTimersByTimeAsync(3000);
      await turn;
      expect(fake.calls()).toBe(3);
      expect(fake.agent.state.errorMessage).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not restart the agent after the turn timed out during a retry wait', async () => {
    vi.useFakeTimers();
    try {
      const fake = realisticAgent(1);
      const session = createAgentSession({
        layer: 'analyst',
        symbol: 'AVGO.US',
        model: fakeModel,
        systemPrompt: 'system prompt',
        tools: [],
        agentFactory: () => fake.agent,
      });
      // The first retry would wait 1000ms; the turn's limit is 500ms.
      const turn = session.runTurn('hi', 500);
      const settled = turn.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(500);
      expect(await settled).toBeInstanceOf(AgentTimeoutError);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fake.calls()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops a pending retry as soon as the caller aborts', async () => {
    vi.useFakeTimers();
    try {
      const fake = realisticAgent(1);
      const session = createAgentSession({
        layer: 'chat',
        symbol: 'MU.US',
        model: fakeModel,
        systemPrompt: 'system prompt',
        tools: [],
        agentFactory: () => fake.agent,
      });
      const turn = session.runTurn('hi');
      const settled = turn.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10);
      session.agent.abort();
      // Resolves on the abort, not after the 1000ms backoff.
      await vi.advanceTimersByTimeAsync(0);
      const error = await settled;
      expect(String(error)).toMatch(/abort/i);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fake.calls()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a network error with increasing delays and settles', async () => {
    vi.useFakeTimers();
    try {
      let continues = 0;
      const agentFactory: AiAgentFactory = () => ({
        prompt: async () => {
          throw new Error('network down');
        },
        continue: async () => {
          continues += 1;
          if (continues < 2) throw new Error('network down');
        },
        abort: () => {},
      });
      const session = createAgentSession({
        layer: 'chat',
        symbol: 'MU.US',
        model: fakeModel,
        systemPrompt: 'system prompt',
        tools: [],
        agentFactory,
      });

      const turn = session.runTurn('hi');
      await vi.advanceTimersByTimeAsync(1000);
      expect(continues).toBe(1);
      await vi.advanceTimersByTimeAsync(1999);
      expect(continues).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(continues).toBe(2);
      await turn;
      expect(session.isDone()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after five network retries and throws the last error', async () => {
    vi.useFakeTimers();
    try {
      let continues = 0;
      const agentFactory: AiAgentFactory = () => ({
        prompt: async () => {
          throw new Error('network down');
        },
        continue: async () => {
          continues += 1;
          throw new Error(`network down ${continues}`);
        },
        abort: () => {},
      });
      const session = createAgentSession({
        layer: 'chat',
        symbol: 'MU.US',
        model: fakeModel,
        systemPrompt: 'system prompt',
        tools: [],
        agentFactory,
      });

      const turn = session.runTurn('hi');
      const rejected = expect(turn).rejects.toThrow('network down 5');
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16_000);
      await rejected;
      expect(continues).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a non-network error', async () => {
    let continues = 0;
    const agentFactory: AiAgentFactory = () => ({
      prompt: async () => {
        throw new Error('invalid api key');
      },
      continue: async () => {
        continues += 1;
      },
      abort: () => {},
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    await expect(session.runTurn('hi')).rejects.toThrow('invalid api key');
    expect(continues).toBe(0);
  });

  it('does not continue after an abort', async () => {
    let continues = 0;
    const agentFactory: AiAgentFactory = () => ({
      prompt: async () => {
        throw new Error('aborted');
      },
      continue: async () => {
        continues += 1;
      },
      abort: () => {},
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    await expect(session.runTurn('hi')).rejects.toThrow('aborted');
    expect(continues).toBe(0);
  });

  it('does not time out when timeoutMs is omitted', async () => {
    vi.useFakeTimers();
    try {
      let resolvePrompt: (() => void) | undefined;
      const agentFactory: AiAgentFactory = () => ({
        prompt: () =>
          new Promise<void>((resolve) => {
            resolvePrompt = resolve;
          }),
        abort: () => {},
      });
      const session = createAgentSession({
        layer: 'chat',
        symbol: 'MU.US',
        model: fakeModel,
        systemPrompt: 'system prompt',
        tools: [],
        agentFactory,
      });

      const turn = session.runTurn('hi');
      await vi.advanceTimersByTimeAsync(180_000);
      expect(session.isDone()).toBe(false);
      resolvePrompt?.();
      await turn;
      expect(session.isDone()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with AgentTimeoutError, aborts the agent, and sets isDone on timeout', async () => {
    let aborted = false;
    const agentFactory: AiAgentFactory = () => ({
      prompt: () => new Promise<void>(() => {}),
      abort: () => {
        aborted = true;
      },
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    await expect(session.runTurn('hi', 10)).rejects.toBeInstanceOf(AgentTimeoutError);
    expect(aborted).toBe(true);
    expect(session.isDone()).toBe(true);
  });

  it('supports sequential runTurn calls after a completed turn', async () => {
    const prompts: string[] = [];
    const agentFactory: AiAgentFactory = () => ({
      prompt: async (text: string) => {
        prompts.push(text);
      },
      abort: () => {},
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    await session.runTurn('first', 1000);
    expect(session.isDone()).toBe(true);
    await session.runTurn('second', 1000);
    expect(session.isDone()).toBe(true);
    expect(prompts).toEqual(['first', 'second']);
  });

  it('rejects a concurrent runTurn while one is in flight, and the first turn still settles normally', async () => {
    let resolvePrompt: (() => void) | undefined;
    const agentFactory: AiAgentFactory = () => ({
      prompt: () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
      abort: () => {},
    });
    const session = createAgentSession({
      layer: 'chat',
      symbol: 'MU.US',
      model: fakeModel,
      systemPrompt: 'system prompt',
      tools: [],
      agentFactory,
    });

    const firstTurn = session.runTurn('first', 1000);
    await expect(session.runTurn('second', 1000)).rejects.toThrow(/already in flight/);

    resolvePrompt?.();
    await expect(firstTurn).resolves.toBeUndefined();
    expect(session.isDone()).toBe(true);
  });
});
