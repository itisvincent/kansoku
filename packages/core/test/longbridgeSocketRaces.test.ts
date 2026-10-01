import { describe, expect, it } from 'vitest';
import { LongbridgeQuoteSocket, type WebSocketLike } from '../src/marketdata/longbridgeSocket.js';

type Listener = (event: { data?: unknown }) => void;

function response(command: number, requestId: number, body: number[] = []): Uint8Array {
  return Uint8Array.from([
    2, command,
    (requestId >>> 24) & 0xff, (requestId >>> 16) & 0xff, (requestId >>> 8) & 0xff, requestId & 0xff,
    0, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff, ...body,
  ]);
}

const AUTH_BODY = [(1 << 3) | 2, 7, ...Buffer.from('session'), 2 << 3, 120];

/** Answers every request at once, except AUTH while `holdAuth` is set. */
class FakeSocket implements WebSocketLike {
  binaryType = '';
  readyState = 0;
  listeners = new Map<string, Listener[]>();
  commands: number[] = [];
  holdAuth = false;
  heldAuth: number | null = null;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  send(data: Uint8Array): void {
    const command = data[1];
    const requestId = data[2] * 0x1000000 + (data[3] << 16) + (data[4] << 8) + data[5];
    this.commands.push(command);
    if (command === 2 && this.holdAuth) {
      this.heldAuth = requestId;
      return;
    }
    const body = command === 2 ? AUTH_BODY : [];
    queueMicrotask(() => this.emit('message', { data: response(command, requestId, body) }));
  }
  answerAuth(): void {
    this.emit('message', { data: response(2, this.heldAuth!, AUTH_BODY) });
  }
  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
}

const deps = (sockets: FakeSocket[]) => ({
  createSocket: () => {
    const fake = sockets.shift()!;
    queueMicrotask(() => {
      fake.readyState = 1;
      fake.emit('open');
    });
    return fake;
  },
  loadToken: async () => ({
    clientId: 'c', accessToken: 't', refreshToken: null, expiresAt: 4_102_444_800, dcRegion: 'us',
  }),
  getOtp: async () => 'otp',
  endpoint: 'wss://example.test/v2',
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LongbridgeQuoteSocket races', () => {
  it('holds other requests until login is answered', async () => {
    const fake = new FakeSocket();
    fake.holdAuth = true;
    const socket = new LongbridgeQuoteSocket(deps([fake]));
    const first = socket.subscribe(['AAPL.US'], [1]);
    await tick();
    // The socket is open but AUTH is unanswered: a second caller must wait.
    const second = socket.queryStaticNames(['AAPL.US']).catch(() => []);
    await tick();
    expect(fake.commands).toEqual([2]);
    fake.answerAuth();
    await first;
    await second;
    expect(fake.commands[0]).toBe(2);
    expect(fake.commands.slice(1)).toContain(6);
    socket.close();
  });

  it('ignores a late close from a socket it already replaced', async () => {
    const old = new FakeSocket();
    const next = new FakeSocket();
    const socket = new LongbridgeQuoteSocket(deps([old, next]));
    await socket.subscribe(['AAPL.US'], [1]);
    // The old socket starts closing; a new connection is made before its close event.
    old.readyState = 2;
    await socket.connect();
    expect([2, 3]).toContain(next.commands[0]); // login or session resume
    old.emit('close');
    // The new connection still serves requests.
    await expect(socket.queryStaticNames(['AAPL.US'])).resolves.toBeDefined();
    socket.close();
  });
});
