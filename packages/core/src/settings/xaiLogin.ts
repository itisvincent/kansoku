import { randomUUID } from 'node:crypto';
import type { OAuthAuth } from '@earendil-works/pi-ai';
import type { AppCredentialStore } from '../ai/settings/credentialStore.js';
import type { XaiLoginState } from '../contract/settings.js';
import { ClientError } from '../platform/errors.js';

interface LoginSession {
  state: XaiLoginState;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
}

// Tokens stay in the kernel and use the existing encrypted credential store.
// Only the user code, verification URL and status cross IPC/HTTP.
export function createXaiLogin() {
  let session: LoginSession | undefined;

  const cancel = (sessionId?: string) => {
    if (!session || (sessionId !== undefined && session.state.sessionId !== sessionId)) return;
    clearTimeout(session.timer);
    session.controller.abort();
    if (session.state.status === 'pending')
      session.state = { ...session.state, status: 'cancelled' };
  };

  return {
    cancel,
    poll(sessionId: string): XaiLoginState {
      if (!session || session.state.sessionId !== sessionId) {
        throw new ClientError('This xAI login session has ended. Please sign in again.');
      }
      return { ...session.state };
    },
    start(oauth: OAuthAuth, credentials: AppCredentialStore): XaiLoginState {
      cancel();
      const controller = new AbortController();
      const current: LoginSession = {
        state: { sessionId: randomUUID(), status: 'pending' },
        controller,
        timer: setTimeout(() => {
          controller.abort();
          current.state = {
            ...current.state,
            status: 'error',
            error: 'xAI login timed out. Please sign in again.',
          };
        }, 10 * 60_000),
      };
      current.timer.unref();
      session = current;
      void (async () => {
        try {
          const credential = await oauth.login({
            signal: controller.signal,
            prompt: async () => {
              throw new Error('Unexpected xAI login prompt. Please try again.');
            },
            notify(event) {
              if (controller.signal.aborted || event.type !== 'device_code') return;
              const url = new URL(event.verificationUri);
              if (
                url.protocol !== 'https:' ||
                (url.hostname !== 'x.ai' && !url.hostname.endsWith('.x.ai'))
              ) {
                throw new Error('Unexpected xAI verification address.');
              }
              current.state = {
                ...current.state,
                userCode: event.userCode,
                verificationUri: url.href,
              };
            },
          });
          await credentials.modify('xai', async () => {
            if (controller.signal.aborted) return undefined;
            return credential;
          });
          if (!controller.signal.aborted)
            current.state = { sessionId: current.state.sessionId, status: 'connected' };
        } catch (error) {
          if (!controller.signal.aborted) {
            current.state = {
              sessionId: current.state.sessionId,
              status: 'error',
              error: error instanceof Error ? error.message : 'xAI sign-in failed.',
            };
          }
        } finally {
          clearTimeout(current.timer);
        }
      })();
      return { ...current.state };
    },
  };
}

export const xaiLogin = createXaiLogin();
