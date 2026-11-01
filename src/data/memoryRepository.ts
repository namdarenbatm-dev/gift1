import type { AppState, CommandResult, Envelope } from '../domain/types';
import { applyCommand, emptyState } from '../domain/commands';
import { adminSnapshot, agentSnapshot } from '../domain/projections';
import type { AdminSnapshot, AgentSnapshot } from '../domain/projections';
import type { Repository } from './repository';

export interface MemoryRepositoryOptions {
  /** Artificial latency, to behave like a network call. */
  latencyMs?: number;
  clock?: () => number;
  initial?: AppState;
}

/**
 * Server stand-in. Everything crosses a JSON boundary, exactly like a network hop,
 * so a test that passes here cannot rely on shared object references.
 * The reference backend (server/reference-server.ts) wraps this same class.
 */
export function createMemoryRepository(opts: MemoryRepositoryOptions = {}): Repository & { peek(): AppState } {
  let state: AppState = opts.initial ?? emptyState();
  const clock = opts.clock ?? Date.now;
  const wait = () => (opts.latencyMs ? new Promise<void>((r) => setTimeout(r, opts.latencyMs)) : Promise.resolve());
  const wire = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  return {
    kind: 'memory',
    peek: () => state,
    async getAdminSnapshot(): Promise<AdminSnapshot> {
      await wait();
      return wire(adminSnapshot(state));
    },
    async getAgentSnapshot(agentId: string): Promise<AgentSnapshot | null> {
      await wait();
      return wire(agentSnapshot(state, agentId));
    },
    async execute(env: Envelope): Promise<CommandResult> {
      await wait();
      const { state: next, result } = applyCommand(state, wire(env), clock());
      state = next;
      return wire(result);
    },
  };
}
