import type { CommandResult, Envelope } from '../domain/types';
import type { AdminSnapshot, AgentSnapshot } from '../domain/projections';
import type { Repository } from './repository';
import { RepositoryError } from './repository';

export interface HttpRepositoryOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /**
   * Returns the current session token. The token comes from a real login flow on the server;
   * no secret is ever bundled into this client.
   */
  getToken?: () => string | null | Promise<string | null>;
  timeoutMs?: number;
}

/**
 * Real-backend adapter. Endpoints (see docs/BACKEND.md):
 *   GET  {base}/api/admin/snapshot
 *   GET  {base}/api/agents/{id}/snapshot
 *   POST {base}/api/commands          body: Envelope  →  CommandResult
 *
 * The server must run the same `applyCommand` rules, authorise by token (not by the
 * `actor` field the client sends), and keep reward calculation server-side.
 * Network failures are returned as `NETWORK` errors; retrying with the SAME envelope is safe.
 */
export function createHttpRepository(opts: HttpRepositoryOptions): Repository {
  const doFetch = opts.fetchImpl ?? fetch.bind(globalThis);
  const base = opts.baseUrl.replace(/\/+$/, '');

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...(init?.headers as Record<string, string> | undefined) };
    const token = opts.getToken ? await opts.getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
    try {
      return await doFetch(`${base}${path}`, { ...init, headers, signal: ctrl.signal });
    } catch {
      throw new RepositoryError('ارتباط با سرور برقرار نشد.', 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }

  async function json<T>(res: Response): Promise<T> {
    if (!res.ok && res.status >= 500) throw new RepositoryError('سرور موقتاً در دسترس نیست.', 'NETWORK');
    try {
      return (await res.json()) as T;
    } catch {
      throw new RepositoryError('پاسخ سرور قابل خواندن نیست.', 'BAD_RESPONSE');
    }
  }

  return {
    kind: 'http',
    async getAdminSnapshot() {
      return json<AdminSnapshot>(await request('/api/admin/snapshot'));
    },
    async getAgentSnapshot(agentId) {
      const res = await request(`/api/agents/${encodeURIComponent(agentId)}/snapshot`);
      if (res.status === 404) return null;
      return json<AgentSnapshot>(res);
    },
    async execute(env: Envelope): Promise<CommandResult> {
      try {
        const res = await request('/api/commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(env),
        });
        return await json<CommandResult>(res);
      } catch (e) {
        if (e instanceof RepositoryError) return { ok: false, error: { code: 'NETWORK', message: e.message } };
        throw e;
      }
    },
  };
}
