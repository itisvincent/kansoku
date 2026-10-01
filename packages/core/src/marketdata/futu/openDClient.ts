import { createHash } from 'node:crypto';
import { connect, type Socket } from 'node:net';

/**
 * Minimal client for Futu OpenD, the gateway Futu runs on the user's own machine. Kansoku
 * never sees the Futu login: the user signs in to OpenD, and this client talks to it on
 * localhost.
 *
 * Wire format (Futu OpenAPI): a 44-byte little-endian header, then the body.
 *   "FT" | protoID u32 | fmt u8 (1 = JSON) | ver u8 | serialNo u32 | bodyLen u32 |
 *   SHA1(body) [20] | reserved [8]
 * Bodies are sent as JSON (`{"c2s": {...}}`), so no protobuf library is needed. This
 * works while OpenD has no RSA key configured, which is its default; with a key, OpenD
 * requires encrypted packets and InitConnect fails with a clear error.
 */

export const PROTO = {
  initConnect: 1001,
  keepAlive: 1004,
  getAccList: 2001,
  getFunds: 2101,
  getPositionList: 2102,
  getUserSecurity: 3213,
  getUserSecurityGroup: 3222,
} as const;

const HEADER_BYTES = 44;
const FMT_JSON = 1;
const MAX_BODY_BYTES = 32 * 1024 * 1024;

export class OpenDError extends Error {
  constructor(
    message: string,
    readonly code: 'unreachable' | 'timeout' | 'closed' | 'protocol' | 'rejected',
  ) {
    super(message);
    this.name = 'OpenDError';
  }
}

interface OpenDResponse<T> {
  retType?: number;
  retMsg?: string;
  errCode?: number;
  s2c?: T;
}

export function encodePacket(protoId: number, serialNo: number, body: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(body), 'utf8');
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('FT', 0, 'ascii');
  header.writeUInt32LE(protoId, 2);
  header.writeUInt8(FMT_JSON, 6);
  header.writeUInt8(0, 7);
  header.writeUInt32LE(serialNo, 8);
  header.writeUInt32LE(json.length, 12);
  createHash('sha1').update(json).digest().copy(header, 16);
  return Buffer.concat([header, json]);
}

export interface DecodedPacket {
  protoId: number;
  serialNo: number;
  body: Buffer;
}

/** Splits complete packets off the front of `buffer`; returns them and the leftover bytes. */
export function decodePackets(buffer: Buffer): { packets: DecodedPacket[]; rest: Buffer } {
  const packets: DecodedPacket[] = [];
  let offset = 0;
  while (buffer.length - offset >= HEADER_BYTES) {
    if (buffer.toString('ascii', offset, offset + 2) !== 'FT') {
      throw new OpenDError('OpenD sent data that is not an OpenAPI packet', 'protocol');
    }
    const bodyLen = buffer.readUInt32LE(offset + 12);
    if (bodyLen > MAX_BODY_BYTES) throw new OpenDError('OpenD packet is too large', 'protocol');
    if (buffer.length - offset < HEADER_BYTES + bodyLen) break;
    packets.push({
      protoId: buffer.readUInt32LE(offset + 2),
      serialNo: buffer.readUInt32LE(offset + 8),
      body: buffer.subarray(offset + HEADER_BYTES, offset + HEADER_BYTES + bodyLen),
    });
    offset += HEADER_BYTES + bodyLen;
  }
  return { packets, rest: buffer.subarray(offset) };
}

export interface OpenDSession {
  request<T>(protoId: number, c2s: Record<string, unknown>): Promise<T>;
  close(): void;
}

export interface OpenDConnectOptions {
  host: string;
  port: number;
  timeoutMs?: number;
}

/**
 * Opens a connection, performs InitConnect, and returns a session for requests. Each
 * session is short-lived (the caller closes it), so no keep-alive is needed.
 */
export async function openOpenDSession(options: OpenDConnectOptions): Promise<OpenDSession> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const socket = await new Promise<Socket>((resolve, reject) => {
    const s = connect({ host: options.host, port: options.port });
    const timer = setTimeout(() => {
      s.destroy();
      reject(new OpenDError(`OpenD did not answer on ${options.host}:${options.port}`, 'timeout'));
    }, timeoutMs);
    s.once('connect', () => {
      clearTimeout(timer);
      resolve(s);
    });
    s.once('error', (error) => {
      clearTimeout(timer);
      reject(
        new OpenDError(
          `OpenD is not reachable on ${options.host}:${options.port} (${(error as NodeJS.ErrnoException).code ?? error.message}). Is OpenD running and logged in?`,
          'unreachable',
        ),
      );
    });
  });

  let serial = 0;
  let buffer: Buffer = Buffer.alloc(0);
  let closed = false;
  const pending = new Map<
    number,
    { resolve: (body: Buffer) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  const failAll = (error: Error) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  };

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    try {
      const { packets, rest } = decodePackets(buffer);
      buffer = rest;
      for (const packet of packets) {
        const entry = pending.get(packet.serialNo);
        if (!entry) continue; // pushes and notifications are not used
        pending.delete(packet.serialNo);
        clearTimeout(entry.timer);
        entry.resolve(packet.body);
      }
    } catch (error) {
      failAll(error as Error);
      socket.destroy();
    }
  });
  socket.on('close', () => {
    closed = true;
    failAll(new OpenDError('OpenD closed the connection', 'closed'));
  });
  socket.on('error', () => {
    // 'close' follows and fails what is pending.
  });

  const request = async <T>(protoId: number, c2s: Record<string, unknown>): Promise<T> => {
    if (closed) throw new OpenDError('OpenD connection is closed', 'closed');
    const serialNo = ++serial;
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(serialNo);
        reject(new OpenDError(`OpenD request ${protoId} timed out`, 'timeout'));
      }, timeoutMs);
      pending.set(serialNo, { resolve, reject, timer });
      socket.write(encodePacket(protoId, serialNo, { c2s }));
    });
    let response: OpenDResponse<T>;
    try {
      response = JSON.parse(raw.toString('utf8')) as OpenDResponse<T>;
    } catch {
      throw new OpenDError(
        `OpenD answered request ${protoId} with data that is not JSON (is an RSA key set in OpenD?)`,
        'protocol',
      );
    }
    if ((response.retType ?? 0) !== 0) {
      throw new OpenDError(
        response.retMsg || `OpenD refused request ${protoId} (retType ${response.retType})`,
        'rejected',
      );
    }
    return (response.s2c ?? {}) as T;
  };

  const session: OpenDSession = {
    request,
    close() {
      closed = true;
      socket.end();
      socket.destroy();
    },
  };

  try {
    await request(PROTO.initConnect, {
      clientVer: 100,
      clientID: 'kansoku',
      recvNotify: false,
      packetEncAlgo: -1, // no encryption
      pushProtoFmt: FMT_JSON,
      programmingLanguage: 'TypeScript',
    });
  } catch (error) {
    session.close();
    throw error;
  }
  return session;
}
