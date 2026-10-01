import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, Server } from 'node:http';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Constructor } from '@tsuki-hono/common';
import { Hono } from 'hono';
import { BASE_URL, LEGACY_CHARTS_DIR, WEB_DIST } from '@kansoku/core/platform/env';
import { attachWs } from './realtime/wsHost.js';
import { refuseReason } from './localGuard.js';

export interface HostHandle {
  server: Server;
}

export async function startHost(
  port: number,
  isDevKernel: boolean,
  extraModules: readonly Constructor[] = [],
): Promise<HostHandle> {
  const { createKernel } = await import('./bootstrap.js');
  const kernel = await createKernel(extraModules);
  const apiApp = kernel.app.getInstance();

  const app = new Hono<{ Bindings: { incoming?: IncomingMessage } }>();
  app.use('*', async (c, next) => {
    const reason = refuseReason({
      remoteAddress: c.env?.incoming?.socket.remoteAddress,
      method: c.req.method,
      host: c.req.header('host'),
      origin: c.req.header('origin'),
      secFetchSite: c.req.header('sec-fetch-site'),
    });
    if (reason) return c.text(reason, 403);
    await next();
  });
  app.all('/api/*', (c) => apiApp.fetch(c.req.raw));
  // Legacy chart pages only. The same folder holds data/app.db and data/ai-secret.key,
  // which must never be served.
  app.use('/legacy/*', async (c, next) => {
    if (!/\.html?$/i.test(new URL(c.req.url).pathname)) return c.text('Not Found', 404);
    await next();
  });
  app.use(
    '/legacy/*',
    serveStatic({
      root: LEGACY_CHARTS_DIR,
      rewriteRequestPath: (path) => path.replace(/^\/legacy/, ''),
    }),
  );

  if (!isDevKernel) {
    if (existsSync(WEB_DIST)) {
      // The sandboxed canvas frame has an opaque origin; its module scripts load cross-origin.
      app.use('*', async (c, next) => {
        await next();
        c.header('access-control-allow-origin', '*');
      });
      app.use('*', serveStatic({ root: WEB_DIST }));
      app.get('*', async (c) => c.html(await readFile(join(WEB_DIST, 'index.html'), 'utf-8')));
    } else {
      console.log(
        `web build not found at ${WEB_DIST} — run "pnpm --filter @kansoku/web build" to serve it; API-only for now`,
      );
    }
  }

  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(
      isDevKernel
        ? `kernel listening on http://localhost:${port}`
        : `trade chart server listening on ${BASE_URL}`,
    );
  });
  attachWs(server as Server, '/api/ws');
  return { server: server as Server };
}
