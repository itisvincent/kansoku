import type {
  Api,
  Credential,
  Model,
  MutableModels,
  RefreshModelsContext,
} from '@earendil-works/pi-ai';

const XAI_PROVIDER = 'xai';
const DEFAULT_BASE_URL = 'https://api.x.ai/v1';

interface RemoteLanguageModel {
  id?: unknown;
  name?: unknown;
  aliases?: unknown;
  input_modalities?: unknown;
  output_modalities?: unknown;
  prompt_text_token_price?: unknown;
  completion_text_token_price?: unknown;
  cached_prompt_text_token_price?: unknown;
  context_window?: unknown;
}

function bearer(credential: Credential | undefined): string | undefined {
  if (!credential) return undefined;
  const token = credential.type === 'oauth' ? credential.access : credential.key;
  return token && token !== '<authenticated>' ? token : undefined;
}

function versionKey(id: string): number[] {
  return (id.match(/\d+/g) ?? []).map(Number);
}

function newest(models: readonly Model<Api>[]): Model<Api> | undefined {
  return [...models].sort((left, right) => {
    const a = versionKey(left.id);
    const b = versionKey(right.id);
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const delta = (b[i] ?? 0) - (a[i] ?? 0);
      if (delta) return delta;
    }
    return right.id.localeCompare(left.id);
  })[0];
}

function displayName(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** xAI prices are USD cents per 100 million tokens. Kansoku stores USD per million. */
export function xaiCentsToUsdPerMillion(cents: unknown): number {
  return typeof cents === 'number' && Number.isFinite(cents) && cents >= 0 ? cents / 10_000 : 0;
}

function usableId(id: string): boolean {
  return /^[a-z0-9][a-z0-9._:-]{1,80}$/i.test(id) && /\d/.test(id);
}

function isChatModel(row: RemoteLanguageModel, id: string): boolean {
  if (!usableId(id)) return false;
  if (/embed|image|video|tts|whisper|imagine|flux/i.test(id)) return false;
  const outputs = Array.isArray(row.output_modalities) ? row.output_modalities : undefined;
  return !outputs?.length || outputs.includes('text');
}

function modalities(row: RemoteLanguageModel, fallback: Model<Api>['input']): Model<Api>['input'] {
  const raw = Array.isArray(row.input_modalities) ? row.input_modalities : [];
  const input = (['text', 'image'] as const).filter((kind) => raw.includes(kind));
  return input.length > 0 ? input : fallback;
}

function idsOf(row: RemoteLanguageModel): string[] {
  const primary = typeof row.id === 'string' ? row.id : typeof row.name === 'string' ? row.name : '';
  const aliases = Array.isArray(row.aliases)
    ? row.aliases.filter((alias): alias is string => typeof alias === 'string')
    : [];
  return [...new Set([primary, ...aliases].map((id) => id.trim()).filter(Boolean))];
}

export function xaiModelsFromRemote(
  rows: readonly RemoteLanguageModel[],
  template: Model<Api>,
  knownIds: ReadonlySet<string>,
): Model<Api>[] {
  const seen = new Set<string>();
  const models: Model<Api>[] = [];
  for (const row of rows) {
    for (const id of idsOf(row)) {
      if (knownIds.has(id) || seen.has(id) || !isChatModel(row, id)) continue;
      seen.add(id);
      const contextWindow =
        typeof row.context_window === 'number' && row.context_window >= 4096
          ? row.context_window
          : template.contextWindow;
      const priced =
        typeof row.prompt_text_token_price === 'number' ||
        typeof row.completion_text_token_price === 'number';
      models.push({
        ...template,
        id,
        name: displayName(id),
        provider: XAI_PROVIDER,
        input: modalities(row, template.input),
        contextWindow,
        maxTokens: Math.min(template.maxTokens, contextWindow),
        cost: priced
          ? {
              input: xaiCentsToUsdPerMillion(row.prompt_text_token_price),
              output: xaiCentsToUsdPerMillion(row.completion_text_token_price),
              cacheRead: xaiCentsToUsdPerMillion(row.cached_prompt_text_token_price),
              cacheWrite: 0,
            }
          : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      });
    }
  }
  return models.sort((left, right) => {
    const a = versionKey(left.id);
    const b = versionKey(right.id);
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const delta = (b[i] ?? 0) - (a[i] ?? 0);
      if (delta) return delta;
    }
    return left.id.localeCompare(right.id);
  });
}

async function readLanguageModels(
  fetcher: typeof fetch,
  baseUrl: string,
  token: string,
  signal: AbortSignal,
): Promise<RemoteLanguageModel[]> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  const root = baseUrl.replace(/\/+$/, '');
  let response = await fetcher(`${root}/language-models`, { headers, signal: requestSignal });
  if (response.status === 404) {
    response = await fetcher(`${root}/models`, { headers, signal: requestSignal });
  }
  if (!response.ok) throw new Error(`xAI model list failed (${response.status})`);
  const payload = (await response.json()) as { models?: unknown; data?: unknown };
  const rows = Array.isArray(payload.models)
    ? payload.models
    : Array.isArray(payload.data)
      ? payload.data
      : [];
  return rows.filter((row): row is RemoteLanguageModel => Boolean(row) && typeof row === 'object');
}

/**
 * The built-in xAI catalog ships with pi-ai and stops at whatever that version knew.
 * Opening settings already refreshes dynamic providers; this makes xAI one of them.
 */
export function installXaiLiveCatalog(
  models: MutableModels,
  fetcher: typeof fetch = fetch,
): void {
  const source = models.getProvider(XAI_PROVIDER);
  const template = source ? newest(source.getModels()) : undefined;
  if (!source || !template) return;

  const baseline = source.getModels();
  const knownIds = new Set(baseline.map((model) => model.id));
  let extra: Model<Api>[] = [];
  const baseUrl = source.baseUrl ?? DEFAULT_BASE_URL;

  const publishExtra = async (context: RefreshModelsContext, next: Model<Api>[]) =>
    context.publish({
      persist: { models: next, checkedAt: Date.now() },
      update: () => {
        extra = next;
      },
    });

  models.setProvider({
    ...source,
    getModels: () => [...extra, ...baseline],
    refreshModels: async (context) => {
      if (context.stored) {
        const restored = context.stored.models.filter(
          (model) => model.provider === XAI_PROVIDER && !knownIds.has(model.id),
        );
        if (!(await context.publish({ update: () => { extra = restored; } }))) return;
      }
      if (!context.allowNetwork || context.signal.aborted) return;
      const token = bearer(context.credential);
      if (!token) return;
      const remote = await readLanguageModels(fetcher, baseUrl, token, context.signal);
      if (context.signal.aborted) return;
      await publishExtra(context, xaiModelsFromRemote(remote, template, knownIds));
    },
  });
}
