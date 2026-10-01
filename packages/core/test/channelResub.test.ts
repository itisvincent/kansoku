import { describe, expect, it, vi } from 'vitest';

const unsubs: Array<ReturnType<typeof vi.fn>> = [];
vi.mock('../src/realtime/quotes.js', () => ({
  subscribeQuotes: () => {
    const unsub = vi.fn();
    unsubs.push(unsub);
    return unsub;
  },
}));

const { handleConnection } = await import('../src/realtime/channelProtocol.js');

function fakeConnection() {
  let onMessage: (raw: string) => void = () => {};
  const conn = {
    send: vi.fn(),
    onMessage: (cb: (raw: string) => void) => {
      onMessage = cb;
    },
    onClose: () => {},
  };
  handleConnection(conn as never);
  return { conn, send: (msg: object) => onMessage(JSON.stringify(msg)) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('channel subscriptions', () => {
  it('cleans up every attach when a key is unsubscribed and resubscribed quickly', async () => {
    const { send } = fakeConnection();
    send({ op: 'sub', key: 'q', kind: 'quotes' });
    send({ op: 'unsub', key: 'q' });
    send({ op: 'sub', key: 'q', kind: 'quotes' });
    await settle();
    send({ op: 'unsub', key: 'q' });
    await settle();
    expect(unsubs).toHaveLength(2);
    for (const unsub of unsubs) expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('tells the client when the channel limit is reached', async () => {
    const { conn, send } = fakeConnection();
    for (let i = 0; i < 17; i++) send({ op: 'sub', key: `q${i}`, kind: 'quotes' });
    await settle();
    const last = conn.send.mock.calls.map(([raw]) => String(raw)).find((raw) => raw.includes('"q16"'));
    expect(last).toContain('too many live channels');
  });
});
