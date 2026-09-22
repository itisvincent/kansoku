import type { ApiKeyCredential, CredentialStore } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { describe, expect, it, vi } from 'vitest';
import {
  installXaiLiveCatalog,
  xaiCentsToUsdPerMillion,
} from '../src/ai/runtime/xaiModelCatalog.js';

function credentials(key?: string): CredentialStore {
  const credential: ApiKeyCredential | undefined = key ? { type: 'api_key', key } : undefined;
  return {
    read: async (provider) => (provider === 'xai' ? credential : undefined),
    list: async () => (credential ? [{ providerId: 'xai', type: 'api_key' }] : []),
    modify: async (_provider, fn) => fn(credential),
    delete: async () => {},
  };
}

describe('xAI live model catalog', () => {
  it('converts xAI cents-per-100M prices into USD per million tokens', () => {
    expect(xaiCentsToUsdPerMillion(20_000)).toBe(2);
    expect(xaiCentsToUsdPerMillion(-1)).toBe(0);
  });

  it('adds a newly released chat model without dropping the built-in list', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      expect(String(url)).toBe('https://api.x.ai/v1/language-models');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-xai-key');
      return Response.json({
        models: [
          {
            id: 'grok-4.6',
            aliases: ['grok-latest'],
            input_modalities: ['text', 'image'],
            output_modalities: ['text'],
          },
          {
            id: 'grok-4.7',
            aliases: ['grok-4.7-fast'],
            input_modalities: ['text', 'image'],
            output_modalities: ['text'],
            prompt_text_token_price: 20_000,
            completion_text_token_price: 60_000,
            cached_prompt_text_token_price: 5_000,
          },
          {
            id: 'grok-imagine',
            output_modalities: ['image'],
          },
        ],
      });
    });
    const models = builtinModels({ credentials: credentials('test-xai-key') });
    const before = models.getModels('xai').map((model) => model.id);
    installXaiLiveCatalog(models, fetcher);

    expect((await models.refresh({ force: true, providers: ['xai'] })).errors.size).toBe(0);

    const ids = models.getModels('xai').map((model) => model.id);
    expect(ids.slice(0, 2)).toEqual(['grok-4.7', 'grok-4.7-fast']);
    expect(ids).toEqual(expect.arrayContaining(before));
    expect(ids).not.toContain('grok-imagine');
    expect(models.getModel('xai', 'grok-4.7')).toMatchObject({
      name: 'Grok 4.7',
      api: 'openai-responses',
      cost: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
      input: ['text', 'image'],
    });
    expect(models.getModel('xai', 'grok-4.6')?.name).toBe('Grok 4.6');
  });

  it('keeps a previously pulled model when the next list request fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ models: [{ id: 'grok-4.7', output_modalities: ['text'] }] }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    const models = builtinModels({ credentials: credentials('test-xai-key') });
    installXaiLiveCatalog(models, fetcher);

    expect((await models.refresh({ force: true, providers: ['xai'] })).errors.size).toBe(0);
    expect((await models.refresh({ force: true, providers: ['xai'] })).errors.size).toBe(1);
    expect(models.getModel('xai', 'grok-4.7')).toBeDefined();
  });

  it('falls back to /models when the language-model list is absent', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('/language-models')) return new Response('missing', { status: 404 });
      return Response.json({ data: [{ id: 'grok-4.8' }] });
    });
    const models = builtinModels({ credentials: credentials('test-xai-key') });
    installXaiLiveCatalog(models, fetcher);

    expect((await models.refresh({ force: true, providers: ['xai'] })).errors.size).toBe(0);
    expect(models.getModel('xai', 'grok-4.8')?.name).toBe('Grok 4.8');
  });
});
