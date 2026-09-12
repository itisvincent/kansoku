import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Credential, OAuthAuth, ProviderAuthInteraction } from '@earendil-works/pi-ai';
import type { AppCredentialStore } from '../src/ai/settings/credentialStore.js';
import { createXaiLogin } from '../src/settings/xaiLogin.js';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { createDb } from '../src/db/index.js';
import { createCredentialStore } from '../src/ai/settings/credentialStore.js';
import { decryptWithKey, encryptWithKey } from '../src/platform/secretCrypto.js';
import { providerCredentials } from '../src/db/schema.js';
import { randomBytes } from 'node:crypto';

const token = {
  type: 'oauth' as const,
  access: 'private-access',
  refresh: 'private-refresh',
  expires: 9999999999999,
};

function setup() {
  const manager = createXaiLogin();
  let interaction!: ProviderAuthInteraction;
  let resolve!: (credential: typeof token) => void;
  let reject!: (error: Error) => void;
  let stored: Credential | undefined;
  const oauth = {
    name: 'xAI',
    login: vi.fn((input: ProviderAuthInteraction) => {
      interaction = input;
      return new Promise<typeof token>((yes, no) => {
        resolve = yes;
        reject = no;
      });
    }),
    refresh: vi.fn(),
    toAuth: vi.fn(),
  } satisfies OAuthAuth;
  const credentials = {
    modify: vi.fn(async (_provider, fn) => {
      stored = await fn(stored);
      return stored;
    }),
  } as unknown as AppCredentialStore;
  const state = manager.start(oauth, credentials);
  return {
    manager,
    state,
    credentials,
    oauth,
    resolve: () => resolve(token),
    reject: (message: string) => reject(new Error(message)),
    interaction: () => interaction,
    stored: () => stored,
  };
}

describe('xAI device login', () => {
  afterEach(() => vi.useRealTimers());

  it('persists encrypted OAuth credentials and refreshes them through the model runtime', async () => {
    const key = randomBytes(32);
    const db = createDb(':memory:');
    const manager = createXaiLogin();
    try {
      const store = createCredentialStore(db, {
        status: () => 'ready',
        encrypt: (provider, plaintext) => encryptWithKey(key, provider, plaintext),
        decrypt: (provider, envelope) => decryptWithKey(key, provider, envelope),
        resetKey: () => {},
      });
      const models = builtinModels({ credentials: store });
      const provider = models.getProvider('xai')!;
      const oauth = provider.auth.oauth!;
      const refresh = vi
        .fn()
        .mockResolvedValue({
          ...token,
          access: 'refreshed-access',
          expires: Date.now() + 3600_000,
        });
      models.setProvider({ ...provider, auth: { ...provider.auth, oauth: { ...oauth, refresh } } });
      const state = manager.start(
        { ...oauth, login: async () => ({ ...token, expires: 1 }) },
        store,
      );
      await vi.waitFor(() => expect(manager.poll(state.sessionId).status).toBe('connected'));
      expect(store.listEntries()).toEqual([
        expect.objectContaining({ provider: 'xai', kind: 'oauth', ok: true, masked: null }),
      ]);
      expect(JSON.stringify(db.select().from(providerCredentials).all())).not.toContain(
        'private-access',
      );
      expect(await models.getAuth('xai')).toMatchObject({ auth: { apiKey: 'refreshed-access' } });
      expect(refresh).toHaveBeenCalledOnce();
      expect(await store.read('xai')).toMatchObject({ access: 'refreshed-access' });
    } finally {
      manager.cancel();
      db.$client.close();
    }
  });

  it('exposes only the device code and stores the token before reporting success', async () => {
    const flow = setup();
    flow
      .interaction()
      .notify({
        type: 'device_code',
        userCode: 'ABCD',
        verificationUri: 'https://auth.x.ai/activate',
      });
    expect(flow.manager.poll(flow.state.sessionId)).toMatchObject({
      status: 'pending',
      userCode: 'ABCD',
      verificationUri: 'https://auth.x.ai/activate',
    });
    flow.resolve();
    await vi.waitFor(() =>
      expect(flow.manager.poll(flow.state.sessionId).status).toBe('connected'),
    );
    expect(flow.stored()).toEqual(token);
    expect(JSON.stringify(flow.manager.poll(flow.state.sessionId))).not.toContain('private-');
    expect(flow.manager.poll(flow.state.sessionId).userCode).toBeUndefined();
  });

  it('cancels pending login and never saves a late token', async () => {
    const flow = setup();
    flow.manager.cancel(flow.state.sessionId);
    expect(flow.interaction().signal.aborted).toBe(true);
    flow.resolve();
    await vi.waitFor(() => expect(flow.credentials.modify).toHaveBeenCalled());
    expect(flow.stored()).toBeUndefined();
    expect(flow.manager.poll(flow.state.sessionId).status).toBe('cancelled');
  });

  it('does not let an old dialog cancel the replacement session', async () => {
    const flow = setup();
    const next = flow.manager.start(flow.oauth, flow.credentials);
    flow.manager.cancel(flow.state.sessionId);
    expect(flow.manager.poll(next.sessionId).status).toBe('pending');
    expect(() => flow.manager.poll(flow.state.sessionId)).toThrow(/ended/);
    flow.manager.cancel();
  });

  it('reports provider denial without saving credentials', async () => {
    const flow = setup();
    flow.reject('xAI device authorization was denied');
    await vi.waitFor(() => expect(flow.manager.poll(flow.state.sessionId).status).toBe('error'));
    expect(flow.manager.poll(flow.state.sessionId).error).toContain('denied');
    expect(flow.credentials.modify).not.toHaveBeenCalled();
  });

  it('times out and discards a token arriving after expiry', async () => {
    vi.useFakeTimers();
    const flow = setup();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(flow.interaction().signal.aborted).toBe(true);
    expect(flow.manager.poll(flow.state.sessionId)).toMatchObject({
      status: 'error',
      error: expect.stringContaining('timed out'),
    });
    flow.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(flow.stored()).toBeUndefined();
  });

  it('rejects verification links outside xAI', () => {
    const flow = setup();
    expect(() =>
      flow
        .interaction()
        .notify({
          type: 'device_code',
          userCode: 'ABCD',
          verificationUri: 'https://x.ai.example.com/activate',
        }),
    ).toThrow(/Unexpected/);
    flow.manager.cancel();
  });
});
