import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiAgentFactory, AiAgentHandle } from '../src/ai/agents/agentSession.js';
import {
  buildDeepDiveSystemPrompt,
  deepDiveStatus,
  executeDeepDive,
  resetDeepDiveForTests,
  startDeepDive,
  type DeepDiveDeps,
} from '../src/ai/personas/deepDive/deepDive.js';
import { buildWriteNoteTool } from '../src/ai/personas/deepDive/noteTool.js';
import { ClientError } from '../src/platform/errors.js';
import type { AiModel } from '../src/ai/runtime/models.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;
const SKILL = '# stock-deep-dive\nSix lenses.';
const DISCIPLINE = '# trading-discipline\nRules.';

type Script = (tools: AgentTool[], turn: number) => Promise<void>;

function harness(script: Script, overrides: Partial<DeepDiveDeps> = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), 'deep-dive-test-'));
  const prompts: string[] = [];
  const systemPrompts: string[] = [];
  let turn = 0;
  const agentFactory: AiAgentFactory = ({ tools, systemPrompt }) => {
    systemPrompts.push(systemPrompt);
    const agent: AiAgentHandle = {
      prompt: async (text) => {
        prompts.push(typeof text === 'string' ? text : JSON.stringify(text));
        turn += 1;
        await script(tools, turn);
      },
      abort: () => {},
    };
    return agent;
  };
  const deps: DeepDiveDeps = {
    model: fakeModel,
    repoRoot: sandbox,
    stocksDir: join(sandbox, 'stocks'),
    agentFactory,
    skillText: SKILL,
    disciplineText: DISCIPLINE,
    webSearchConfigured: false,
    exec: async () => ({ stdout: 'ok', stderr: '' }),
    fetchNews: async () => [],
    fetchKline: async () => [],
    ...overrides,
  };
  return { deps, sandbox, prompts, systemPrompts };
}

function tool(tools: AgentTool[], name: string): AgentTool {
  const found = tools.find((entry) => entry.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return result.content.map((part) => part.text ?? '').join('');
}

afterEach(() => resetDeepDiveForTests());

describe('write_note', () => {
  it('writes the note and reports success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'note-'));
    const path = join(dir, 'stocks', 'MU.md');
    let written = false;
    const note = buildWriteNoteTool({ notePath: path, onWritten: () => (written = true) });
    const result = await note.execute('n', { content: '# MU\nBody' });
    expect(textOf(result)).toContain('saved');
    expect(readFileSync(path, 'utf8')).toBe('# MU\nBody\n');
    expect(written).toBe(true);
  });

  it('refuses a rewrite that drops most of a substantial note', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'note-'));
    const path = join(dir, 'MU.md');
    const existing = `# MU\n${'history line\n'.repeat(60)}`;
    writeFileSync(path, existing);
    let written = false;
    const note = buildWriteNoteTool({ notePath: path, onWritten: () => (written = true) });
    const result = await note.execute('n', { content: '# MU\nShort rewrite' });
    expect(textOf(result)).toContain('TD-NOTES-01');
    expect(readFileSync(path, 'utf8')).toBe(existing);
    expect(written).toBe(false);
  });

  it('lets a short stub be replaced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'note-'));
    const path = join(dir, 'MU.md');
    writeFileSync(path, '# MU\nTODO');
    const note = buildWriteNoteTool({ notePath: path, onWritten: () => {} });
    await note.execute('n', { content: '# MU\nA' });
    expect(readFileSync(path, 'utf8')).toBe('# MU\nA\n');
  });

  it('rejects empty content', async () => {
    const note = buildWriteNoteTool({ notePath: join(tmpdir(), 'never.md'), onWritten: () => {} });
    expect(textOf(await note.execute('n', { content: '   ' }))).toContain('empty');
  });
});

describe('executeDeepDive', () => {
  it('succeeds once the note is saved', async () => {
    const h = harness(async (tools) => {
      await tool(tools, 'write_note').execute('w', { content: '# MU — Micron\n## Verdict' });
    });
    const outcome = await executeDeepDive('MU.US', h.deps);
    expect(outcome).toEqual({ ok: true });
    expect(readFileSync(join(h.sandbox, 'stocks', 'MU.md'), 'utf8')).toContain('Micron');
    expect(h.prompts).toHaveLength(1);
    expect(h.prompts[0]).toContain('stocks/MU.md');
  });

  it('nudges once when the note was not saved, then fails', async () => {
    const h = harness(async () => {});
    const outcome = await executeDeepDive('MU.US', h.deps);
    expect(h.prompts).toHaveLength(2);
    expect(h.prompts[1]).toContain('write_note');
    expect(outcome).toEqual({ ok: false, error: 'the note was not saved' });
  });

  it('succeeds when the note is saved on the nudge', async () => {
    const h = harness(async (tools, turn) => {
      if (turn === 2) await tool(tools, 'write_note').execute('w', { content: '# MU' });
    });
    expect(await executeDeepDive('MU.US', h.deps)).toEqual({ ok: true });
  });

  it('offers the research, news, kline and note tools', async () => {
    let names: string[] = [];
    const h = harness(async (tools) => {
      names = tools.map((entry) => entry.name);
      await tool(tools, 'write_note').execute('w', { content: '# MU' });
    });
    await executeDeepDive('MU.US', h.deps);
    expect(names).toEqual(
      expect.arrayContaining(['bash', 'read_skill', 'fetch_news', 'fetch_kline', 'write_note']),
    );
  });

  it('puts the discipline, the CLI map and the skill in the system prompt', async () => {
    const h = harness(async (tools) => {
      await tool(tools, 'write_note').execute('w', { content: '# MU' });
    });
    await executeDeepDive('MU.US', h.deps);
    const prompt = h.systemPrompts[0];
    expect(prompt.indexOf('trading-discipline')).toBeLessThan(prompt.indexOf('stock-deep-dive'));
    expect(prompt).toContain('longbridge financial-report SYM');
    expect(prompt).toContain('Six lenses.');
  });

  it('turns a model failure into an error outcome', async () => {
    const h = harness(async () => {
      throw new Error('provider down');
    });
    expect(await executeDeepDive('MU.US', h.deps)).toEqual({ ok: false, error: 'provider down' });
  });

  it('keeps the system prompt builder stable', () => {
    expect(buildDeepDiveSystemPrompt('D', 'S')).toContain('<skill name="stock-deep-dive">');
  });
});

describe('startDeepDive', () => {
  it('tracks one run at a time and records the result', async () => {
    const h = harness(async (tools) => {
      await tool(tools, 'write_note').execute('w', { content: '# MU' });
    });
    const { result, done } = startDeepDive('MU.US', h.deps);
    expect(result).toEqual({ started: true });
    expect(deepDiveStatus()).toMatchObject({ running: true, symbol: 'MU.US' });

    const busy = (() => {
      try {
        startDeepDive('NVDA.US', h.deps);
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect(busy).toBeInstanceOf(ClientError);
    expect(busy).toMatchObject({ status: 409 });

    await done;
    expect(deepDiveStatus()).toMatchObject({
      running: false,
      lastResult: { symbol: 'MU.US', ok: true },
    });
  });

  it('refuses with 503 when no deep-research model is configured', () => {
    const h = harness(async () => {});
    const error = (() => {
      try {
        startDeepDive('MU.US', { ...h.deps, model: undefined, resolveModel: () => null });
        return null;
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toMatchObject({ status: 503 });
    expect(deepDiveStatus().running).toBe(false);
  });

  it('records a failure with its reason', async () => {
    const h = harness(async () => {});
    const { done } = startDeepDive('MU.US', h.deps);
    await done;
    expect(deepDiveStatus().lastResult).toMatchObject({
      ok: false,
      error: 'the note was not saved',
    });
  });

  it('writes under the configured stocks directory only', async () => {
    const h = harness(async (tools) => {
      await tool(tools, 'write_note').execute('w', { content: '# 700' });
    });
    mkdirSync(join(h.sandbox, 'stocks'), { recursive: true });
    await executeDeepDive('700.HK', h.deps);
    expect(readFileSync(join(h.sandbox, 'stocks', '700.HK.md'), 'utf8')).toBe('# 700\n');
  });
});
