import type { IncomingMessage } from 'node:http';

/**
 * The HTTP host serves one user on one machine. Three checks keep other machines and other
 * websites out, without changing which address the server binds (clients say "localhost",
 * which may resolve to ::1 or 127.0.0.1):
 *  - the connection must come from this machine (loopback), so the LAN cannot reach it;
 *  - the Host header must name this machine, so a DNS-rebinding page cannot reach it;
 *  - a browser request that changes state, and any WebSocket, must come from the app's own
 *    origin (or carry no Origin, like curl and the skills' scripts), so a website the user
 *    visits cannot drive the API (CSRF) or read live positions.
 */

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTNAME = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isLoopbackAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.has(address);
}

export function isLocalHostHeader(host: string | undefined | null): boolean {
  return !host || LOCAL_HOSTNAME.test(host);
}

/** Origin may be absent (non-browser clients). If present it must be this app. */
export function isAllowedOrigin(origin: string | undefined | null): boolean {
  return !origin || LOCAL_ORIGIN.test(origin);
}

export interface RequestFacts {
  remoteAddress: string | undefined;
  method: string;
  host: string | null | undefined;
  origin: string | null | undefined;
  secFetchSite: string | null | undefined;
}

/** Returns a reason to refuse the request, or null to let it through. */
export function refuseReason(facts: RequestFacts): string | null {
  if (!isLoopbackAddress(facts.remoteAddress)) return 'only connections from this computer are accepted';
  if (!isLocalHostHeader(facts.host)) return 'unexpected Host header';
  if (SAFE_METHODS.has(facts.method.toUpperCase())) return null;
  if (facts.secFetchSite && facts.secFetchSite !== 'same-origin' && facts.secFetchSite !== 'none') {
    return 'cross-site request refused';
  }
  if (!isAllowedOrigin(facts.origin)) return 'cross-origin request refused';
  return null;
}

/** WebSocket upgrades carry an Origin from browsers; refuse other sites and other machines. */
export function refuseUpgrade(req: IncomingMessage): string | null {
  if (!isLoopbackAddress(req.socket.remoteAddress)) return 'only connections from this computer are accepted';
  if (!isLocalHostHeader(req.headers.host)) return 'unexpected Host header';
  if (!isAllowedOrigin(req.headers.origin)) return 'cross-origin WebSocket refused';
  return null;
}
