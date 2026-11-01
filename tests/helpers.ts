import assert from 'node:assert/strict';
import { applyCommand, emptyState } from '../src/domain/commands';
import type { AppState, Command, CommandResult, Envelope, Actor, CampaignInput } from '../src/domain/types';

/** Fixed clock: 2026-10-30 (UTC). */
export const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);

export const TIERS = [
  { name: 'برنزی', endQty: 50, rate: 100_000 },
  { name: 'نقره‌ای', endQty: 100, rate: 150_000 },
  { name: 'طلایی', endQty: 199, rate: 200_000 },
  { name: 'پلاتینیوم', endQty: null, rate: 300_000 },
];

export function campaignInput(over: Partial<CampaignInput> = {}): CampaignInput {
  return {
    code: 'T-01',
    name: 'کمپین آزمون',
    description: '',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    products: '',
    agentGroup: '',
    budget: null,
    tiers: TIERS.map((t) => ({ ...t })),
    validSaleRules: '',
    tierCompletionRules: '',
    payoutRules: '',
    ...over,
  };
}

let keyCounter = 0;
export const nextKey = () => `test-key-${++keyCounter}`;

export function run(state: AppState, command: Command, opts: { actor?: Actor; key?: string; now?: number } = {}) {
  const env: Envelope = { idempotencyKey: opts.key ?? nextKey(), actor: opts.actor ?? { role: 'admin' }, command };
  return applyCommand(state, env, opts.now ?? NOW);
}

export function mustOk(r: { result: CommandResult }): Record<string, string | number> {
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  return (r.result as Extract<CommandResult, { ok: true }>).data ?? {};
}

export function mustFail(r: { result: CommandResult }, code: string) {
  assert.equal(r.result.ok, false, 'expected failure ' + code);
  assert.equal((r.result as Extract<CommandResult, { ok: false }>).error.code, code);
}

export interface World {
  state: AppState;
  campaignId: string;
  agentId: string;
}

/** Active campaign + one assigned agent. */
export function makeWorld(over: Partial<CampaignInput> = {}): World {
  let state = emptyState();
  let r = run(state, { type: 'saveCampaign', campaign: campaignInput(over) });
  const campaignId = String(mustOk(r).campaignId);
  state = r.state;
  r = run(state, { type: 'saveAgent', agent: { code: 'AG-1', name: 'کارگزار یک', phone: '', group: '' } });
  const agentId = String(mustOk(r).agentId);
  state = r.state;
  state = run(state, { type: 'assignAgent', agentId, campaignId, assigned: true }).state;
  r = run(state, { type: 'setCampaignStatus', campaignId, status: 'active' });
  mustOk(r);
  return { state: r.state, campaignId, agentId };
}

/** Submits and approves `count` sales for the agent. Returns the new state. */
export function addApproved(world: World, count: number, prefix = 'SN'): AppState {
  let state = world.state;
  const start = state.sales.length;
  for (let i = 0; i < count; i++) {
    const sub = run(state, {
      type: 'submitSale',
      sale: { campaignId: world.campaignId, agentId: world.agentId, serial: `${prefix}${String(start + i + 1).padStart(5, '0')}`, saleDate: '2026-10-20' },
    });
    const saleId = String(mustOk(sub).saleId);
    const rev = run(sub.state, { type: 'reviewSale', saleId, decision: 'approve', expectedVersion: 1 });
    mustOk(rev);
    state = rev.state;
  }
  return state;
}
