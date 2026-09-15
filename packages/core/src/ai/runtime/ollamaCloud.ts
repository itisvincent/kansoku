import { createProvider, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';

export const OLLAMA_CLOUD_PROVIDER = 'ollama-cloud';
const BASE_URL = 'https://ollama.com/v1';
type CloudModel = Model<'openai-completions'>;

interface ModelDetails {
  capabilities?: string[];
  model_info?: Record<string, unknown>;
}

function cloudModel(id: string, details?: ModelDetails): CloudModel {
  const contextLength = Object.entries(details?.model_info ?? {}).find(
    ([key, value]) => key.endsWith('.context_length') && typeof value === 'number',
  )?.[1];
  // If a newly listed model omits limits, use a conservative request budget.
  const contextWindow =
    typeof contextLength === 'number' && contextLength >= 4096 ? contextLength : 65_536;
  const reasoning = details?.capabilities?.includes('thinking') ?? false;
  return {
    id,
    name: id,
    provider: OLLAMA_CLOUD_PROVIDER,
    api: 'openai-completions',
    baseUrl: BASE_URL,
    reasoning,
    ...(reasoning
      ? {
          thinkingLevelMap: {
            minimal: null,
            low: 'low',
            medium: 'medium',
            high: 'high',
            xhigh: null,
            max: null,
          },
        }
      : {}),
    input: details?.capabilities?.includes('vision') ? ['text', 'image'] : ['text'],
    // Requests consume the account's Ollama plan; there is no per-token price to estimate here.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens: Math.min(32_768, Math.floor(contextWindow / 4)),
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsStrictMode: false,
      supportsReasoningEffort: reasoning,
      maxTokensField: 'max_tokens',
    },
  };
}

export function createOllamaCloudProvider(fetcher: typeof fetch = fetch) {
  const detailsCache = new Map<string, ModelDetails>();
  return createProvider<'openai-completions'>({
    id: OLLAMA_CLOUD_PROVIDER,
    name: 'Ollama Cloud',
    baseUrl: BASE_URL,
    auth: {
      apiKey: {
        name: 'Ollama Cloud API key',
        async resolve({ credential, ctx }) {
          const key = credential?.key ?? (await ctx.env('OLLAMA_API_KEY'));
          return key
            ? {
                auth: { apiKey: key },
                source: credential?.key ? 'stored credential' : 'OLLAMA_API_KEY',
              }
            : undefined;
        },
      },
    },
    models: ['gpt-oss:120b', 'gpt-oss:20b'].map((id) =>
      cloudModel(id, {
        capabilities: ['completion', 'tools', 'thinking'],
        model_info: { 'gptoss.context_length': 131_072 },
      }),
    ),
    async fetchModels({ signal }) {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
      // The catalog is public. Credentials are used only for inference requests.
      const response = await fetcher('https://ollama.com/api/tags', { signal: requestSignal });
      if (!response.ok) throw new Error(`Ollama Cloud model list failed (${response.status})`);
      const payload = (await response.json()) as { models?: Array<{ name?: unknown }> };
      const ids = [
        ...new Set(
          (payload.models ?? [])
            .map((model) => model.name)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];
      if (!ids.length) throw new Error('Ollama Cloud returned an empty model list');
      // Fetch capability metadata for new models, at most four requests at a time.
      for (let i = 0; i < ids.length; i += 4) {
        await Promise.all(
          ids.slice(i, i + 4).map(async (id) => {
            if (detailsCache.has(id)) return;
            const details = await fetcher('https://ollama.com/api/show', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: id }),
              signal: requestSignal,
            });
            if (!details.ok)
              throw new Error(`Ollama Cloud model details failed (${details.status})`);
            detailsCache.set(id, (await details.json()) as ModelDetails);
          }),
        );
      }
      return ids.map((id) => cloudModel(id, detailsCache.get(id)));
    },
    api: openAICompletionsApi(),
  });
}
