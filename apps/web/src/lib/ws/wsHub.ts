import { isDesktopRealtime, PortTransport, type SocketLike } from '../portTransport.js';

export type ChannelSpec =
  | { kind: 'quotes'; extra?: string[] }
  | { kind: 'chart'; id: string; count?: number }
  | { kind: 'comments'; symbol: string }
  | { kind: 'notifications' }
  | { kind: 'analyses'; symbol: string }
  | { kind: 'position'; symbol: string }
  | { kind: 'benchmark'; symbol: string }
  | { kind: 'preview'; symbol: string }
  | { kind: 'board' }
  | { kind: 'chat'; id: string }
  | { kind: 'research-chat'; path: string }
  | { kind: 'assistant-chat'; id: string }
  | { kind: 'research-refresh'; path: string }
  | { kind: 'annotations'; symbol: string }
  | { kind: 'analyst-runs' }
  | { kind: 'training-fill' }
  // No symbol means the whole market tape; the server treats an empty string as a
  // bad request rather than as "unfiltered".
  | { kind: 'events'; symbol?: string };

interface ChannelSub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
}

const RECONNECT_MS = 2_000;

export type HubStatus = 'connecting' | 'connected' | 'reconnecting';

let ws: SocketLike | null = null;
let reconnectTimer: number | null = null;
let nextKey = 0;
const subs = new Map<string, ChannelSub>();

let hubStatus: HubStatus = 'connecting';
const statusListeners = new Set<() => void>();

function setHubStatus(next: HubStatus): void {
  if (hubStatus === next) return;
  hubStatus = next;
  for (const listener of statusListeners) listener();
}

export function getHubStatus(): HubStatus {
  return hubStatus;
}

export function subscribeHubStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/ws`;
}

function broadcast(connected: boolean): void {
  for (const sub of subs.values()) sub.onConnected(connected);
}

function cancelReconnect(): void {
  if (reconnectTimer === null) return;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function closeCurrentSocket(): void {
  const sock = ws;
  if (!sock) return;
  ws = null;
  sock.onopen = null;
  sock.onmessage = null;
  sock.onclose = null;
  sock.onerror = null;
  sock.close();
}

function connect(): void {
  if (ws || subs.size === 0) return;
  cancelReconnect();
  const sock = (isDesktopRealtime()
    ? new PortTransport()
    : new WebSocket(wsUrl())) as unknown as SocketLike;
  ws = sock;
  setHubStatus(hubStatus === 'reconnecting' ? 'reconnecting' : 'connecting');
  sock.onopen = () => {
    if (ws !== sock) return;
    for (const [key, sub] of subs) sock.send(JSON.stringify({ op: 'sub', key, ...sub.spec }));
    setHubStatus('connected');
    broadcast(true);
  };
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    let msg: { key: string; payload: unknown };
    try {
      msg = JSON.parse(e.data as string) as { key: string; payload: unknown };
    } catch {
      return;
    }
    subs.get(msg.key)?.onPayload(msg.payload);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    broadcast(false);
    if (subs.size > 0) {
      setHubStatus('reconnecting');
      scheduleReconnect();
    } else {
      setHubStatus('connecting');
    }
  };
  sock.onerror = () => {
    if (ws === sock) sock.close();
  };
}

function scheduleReconnect(): void {
  cancelReconnect();
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

/**
 * Feeds whose every update is the whole current state, so readers can share one server
 * subscription and a late reader can start from the latest update. A stock page reads its
 * own quote in five places (each grid chart, the sidebar, the top bar), and each one used to
 * receive and decode its own copy of the full quote list on every tick.
 */
const SHARED_KINDS = new Set<ChannelSpec['kind']>(['quotes']);

type FeedReader = Pick<ChannelSub, 'onPayload' | 'onConnected'>;

interface SharedFeed {
  readers: Set<FeedReader>;
  /** The newest data update and status report, for a reader that joins later. */
  latest: unknown;
  status: unknown;
  connected: boolean;
  off: () => void;
}

const sharedFeeds = new Map<string, SharedFeed>();

const sharedKey = (spec: ChannelSpec): string =>
  JSON.stringify(spec, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );

const payloadType = (payload: unknown): unknown => (payload as { type?: unknown } | null)?.type;

function openSharedFeed(spec: ChannelSpec, first: FeedReader): SharedFeed {
  // The first reader is in place before the server subscription starts: on an open socket
  // it reports "connected" straight away.
  const feed: SharedFeed = {
    readers: new Set([first]),
    latest: undefined,
    status: undefined,
    connected: false,
    off: () => {},
  };
  feed.off = subscribeServer(
    spec,
    (payload) => {
      if (payloadType(payload) === 'data') feed.latest = payload;
      else if (payloadType(payload) === 'status') feed.status = payload;
      for (const reader of feed.readers) reader.onPayload(payload);
    },
    (connected) => {
      feed.connected = connected;
      // After a drop, the last prices are no longer live: a reader joining now waits for
      // fresh ones instead of being handed old ones as current.
      if (!connected) {
        feed.latest = undefined;
        feed.status = undefined;
      }
      for (const reader of feed.readers) reader.onConnected(connected);
    },
  );
  return feed;
}

export function subscribeChannel(
  spec: ChannelSpec,
  onPayload: (payload: unknown) => void,
  onConnected: (connected: boolean) => void,
): () => void {
  if (!SHARED_KINDS.has(spec.kind)) return subscribeServer(spec, onPayload, onConnected);
  const key = sharedKey(spec);
  const reader = { onPayload, onConnected };
  let feed = sharedFeeds.get(key);
  if (feed) {
    if (feed.connected) {
      if (feed.latest !== undefined) onPayload(feed.latest);
      if (feed.status !== undefined) onPayload(feed.status);
      onConnected(true);
    }
    feed.readers.add(reader);
  } else {
    feed = openSharedFeed(spec, reader);
    sharedFeeds.set(key, feed);
  }
  const shared = feed;
  return () => {
    shared.readers.delete(reader);
    if (shared.readers.size > 0) return;
    if (sharedFeeds.get(key) === shared) sharedFeeds.delete(key);
    shared.off();
  };
}

function subscribeServer(
  spec: ChannelSpec,
  onPayload: (payload: unknown) => void,
  onConnected: (connected: boolean) => void,
): () => void {
  const key = `c${nextKey++}`;
  subs.set(key, { spec, onPayload, onConnected });
  if (!ws) {
    connect();
  } else if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ op: 'sub', key, ...spec }));
    onConnected(true);
  }
  return () => {
    subs.delete(key);
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'unsub', key }));
    if (subs.size === 0) {
      cancelReconnect();
      setHubStatus('connecting');
      closeCurrentSocket();
    }
  };
}
