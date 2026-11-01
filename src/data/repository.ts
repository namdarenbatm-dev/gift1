import type { Actor, Command, CommandResult, Envelope } from '../domain/types';
import type { AdminSnapshot, AgentSnapshot } from '../domain/projections';

/**
 * The seam between the UI and wherever the data lives.
 *
 * It is shaped like a server API on purpose:
 *   - asynchronous,
 *   - command-based (the client asks for «approve sale», it never writes state),
 *   - idempotent (every command carries a key; a retry never repeats a payout),
 *   - versioned (reviewing a sale needs the version the user saw),
 *   - the agent view is a separate, minimal read model.
 *
 * Adapters: localStorageRepository (pilot), memoryRepository (tests / server stub),
 * httpRepository (real backend; see docs/BACKEND.md).
 */
export interface Repository {
  readonly kind: 'local' | 'memory' | 'http';
  getAdminSnapshot(): Promise<AdminSnapshot>;
  /** `null` when the agent does not exist. */
  getAgentSnapshot(agentId: string): Promise<AgentSnapshot | null>;
  execute(envelope: Envelope): Promise<CommandResult>;
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    public code: 'NETWORK' | 'STORAGE_ERROR' | 'BAD_RESPONSE',
  ) {
    super(message);
  }
}

export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function envelope(command: Command, actor: Actor = { role: 'admin' }, extra: Partial<Envelope> = {}): Envelope {
  return { idempotencyKey: newIdempotencyKey(), actor, command, ...extra };
}
