import type { AppState, CommandResult, Envelope } from '../domain/types';
import { applyCommand, emptyState, isAppState } from '../domain/commands';
import { adminSnapshot, agentSnapshot } from '../domain/projections';
import type { AdminSnapshot, AgentSnapshot } from '../domain/projections';
import type { Repository } from './repository';
import { RepositoryError } from './repository';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_STORAGE_KEY = 'techno-campgain:v2';

/**
 * Pilot adapter: the whole state lives in this browser's localStorage.
 * It is NOT shared between devices and NOT secure — see README.
 * It reads storage before every command, so two open tabs cannot overwrite each other with stale data.
 */
export function createLocalStorageRepository(storage: StorageLike, key = DEFAULT_STORAGE_KEY, clock: () => number = Date.now): Repository {
  function load(): AppState {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      throw new RepositoryError('دسترسی به حافظه‌ی مرورگر ممکن نیست.', 'STORAGE_ERROR');
    }
    if (!raw) return emptyState();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isAppState(parsed)) return { ...parsed, processed: parsed.processed ?? {} };
    } catch {
      /* fall through to quarantine */
    }
    // Unreadable data is moved aside instead of being silently overwritten.
    try {
      storage.setItem(`${key}.corrupt-${clock()}`, raw);
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
    return emptyState();
  }

  function save(state: AppState): void {
    storage.setItem(key, JSON.stringify(state));
  }

  return {
    kind: 'local',
    async getAdminSnapshot(): Promise<AdminSnapshot> {
      return adminSnapshot(load());
    },
    async getAgentSnapshot(agentId: string): Promise<AgentSnapshot | null> {
      return agentSnapshot(load(), agentId);
    },
    async execute(env: Envelope): Promise<CommandResult> {
      let state: AppState;
      try {
        state = load();
      } catch (e) {
        return { ok: false, error: { code: 'STORAGE_ERROR', message: (e as Error).message } };
      }
      const { state: next, result } = applyCommand(state, env, clock());
      if (result.ok && next !== state) {
        try {
          save(next);
        } catch {
          return {
            ok: false,
            error: { code: 'STORAGE_ERROR', message: 'حافظه‌ی مرورگر پر است یا در دسترس نیست؛ تغییر ذخیره نشد. از «تنظیمات» پشتیبان بگیرید.' },
          };
        }
      }
      return result;
    },
  };
}
