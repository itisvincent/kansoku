import { createModels, type ApiKeyCredential, type CredentialStore } from '@earendil-works/pi-ai';
import { describe, expect, it, vi } from 'vitest';
import { createOllamaCloudProvider, OLLAMA_CLOUD_PROVIDER } from '../src/ai/runtime/ollamaCloud.js';
import {
  initModelsRuntime,
  setModelsRuntimeForTests,
  SINGLE_KEY_PROVIDERS,
} from '../src/ai/runtime/modelsRuntime.js';

function credentials(key?: string): CredentialStore {
  const credential: ApiKeyCredential | undefined = key ? { type: 'api_key', key } : undefined;
  return {
    read: async () => credential,
    list: async () =>
      credential ? [{ providerId: OLLAMA_CLOUD_PROVIDER, type: 'api_key' as const }] : [],
    modify: async (_provider, fn) => fn(credential),
    delete: async () => {},
  };
}

describe('Ollama Cloud provider', () => {
  it('registers in the app runtime and requires the account API key', async () => {
    setModelsRuntimeForTests(null);
    try {
      const models = initModelsRuntime(credentials());
      expect(SINGLE_KEY_PROVIDERS.has(OLLAMA_CLOUD_PROVIDER)).toBe(true);
      expect(models.getProvider(OLLAMA_CLOUD_PROVIDER)?.name).toBe('Ollama Cloud');
      expect(await models.getAuth(OLLAMA_CLOUD_PROVIDER)).toBeUndefined();
      expect(models.getModel(OLLAMA_CLOUD_PROVIDER, 'gpt-oss:120b')?.baseUrl).toBe(
        'https://ollama.com/v1',
      );
    } finally {
      setModelsRuntimeForTests(null);
    }
  });

  it('refreshes official model IDs and capabilities, retaining the catalog on a failed refresh', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
      if (String(url).endsWith('/tags'))
        return Response.json({ models: [{ name: 'vision-model:latest' }] });
      expect(JSON.parse(String(init?.body))).toEqual({ model: 'vision-model:latest' });
      return Response.json({
        capabilities: ['completion', 'tools', 'thinking', 'vision'],
        model_info: { 'test.context_length': 131072 },
      });
    });
    const models = createModels({ credentials: credentials('test-ollama-key') });
    models.setProvider(createOllamaCloudProvider(fetcher));
    expect((await models.refresh()).errors.size).toBe(0);
    expect(models.getModel(OLLAMA_CLOUD_PROVIDER, 'vision-model:latest')).toMatchObject({
      id: 'vision-model:latest',
      reasoning: true,
      input: ['text', 'image'],
      contextWindow: 131072,
    });
    fetcher.mockResolvedValue(new Response('Unavailable', { status: 503 }));
    expect((await models.refresh({ force: true })).errors.size).toBe(1);
    expect(models.getModel(OLLAMA_CLOUD_PROVIDER, 'vision-model:latest')).toBeDefined();
  });

  it('streams with Bearer authentication and Ollama-compatible chat parameters', async () => {
    const models = createModels({ credentials: credentials('test-ollama-key') });
    models.setProvider(createOllamaCloudProvider());
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      expect(String(url)).toBe('https://ollama.com/v1/chat/completions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-ollama-key');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'gpt-oss:120b',
        stream: true,
        max_tokens: 256,
        reasoning_effort: 'low',
      });
      expect(body).not.toHaveProperty('store');
      expect(body).not.toHaveProperty('max_completion_tokens');
      const chunks = [
        {
          id: 'test',
          choices: [
            { index: 0, delta: { role: 'assistant', content: 'Connected' }, finish_reason: null },
          ],
        },
        {
          id: 'test',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        },
      ];
      return new Response(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        {
          headers: { 'Content-Type': 'text/event-stream' },
        },
      );
    });
    const model = models.getModel(OLLAMA_CLOUD_PROVIDER, 'gpt-oss:120b')!;
    const result = await models.completeSimple(
      model,
      {
        systemPrompt: 'Connection test.',
        messages: [{ role: 'user', content: 'Hello', timestamp: 0 }],
      },
      { fetch: fetcher, reasoning: 'low', maxTokens: 256 },
    );
    expect(result.stopReason).toBe('stop');
    expect(result.content).toEqual([{ type: 'text', text: 'Connected' }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
