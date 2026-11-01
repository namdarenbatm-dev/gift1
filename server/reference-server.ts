/**
 * Reference backend — for development and for the contract tests ONLY.
 * It proves that the repository contract works over a real network hop
 * (HTTP + JSON). It has NO authentication and keeps data in memory, so it must
 * never be exposed to the internet. A production backend must add real login,
 * per-role authorisation (trust the token, not `envelope.actor`) and a database.
 *
 *   npm run dev:server        # listens on http://localhost:8787
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMemoryRepository } from '../src/data/memoryRepository';
import type { Envelope } from '../src/domain/types';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function startReferenceServer(port = 0, clock?: () => number): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  const repo = createMemoryRepository({ clock });
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'OPTIONS') return send(204, {});
      if (req.method === 'GET' && url.pathname === '/api/admin/snapshot') return send(200, await repo.getAdminSnapshot());
      const m = /^\/api\/agents\/([^/]+)\/snapshot$/.exec(url.pathname);
      if (req.method === 'GET' && m) {
        const snap = await repo.getAgentSnapshot(decodeURIComponent(m[1]));
        return snap ? send(200, snap) : send(404, { error: 'not found' });
      }
      if (req.method === 'POST' && url.pathname === '/api/commands') {
        const env = JSON.parse(await readBody(req)) as Envelope;
        return send(200, await repo.execute(env));
      }
      return send(404, { error: 'not found' });
    } catch (e) {
      return send(500, { error: (e as Error).message });
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address() as AddressInfo;
      resolve({
        server,
        url: `http://127.0.0.1:${p}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

// Run directly: `tsx server/reference-server.ts`
if (process.argv[1] && /reference-server\.(ts|js)$/.test(process.argv[1])) {
  startReferenceServer(Number(process.env.PORT ?? 8787)).then(({ url }) => console.log(`Reference server: ${url}`));
}
