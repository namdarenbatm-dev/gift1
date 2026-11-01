import type { AppState, Campaign, Payout, Sale } from './types';
import { agentCampaignStats } from './ledger';
import type { AgentCampaignStats } from './ledger';
import { tierRanges } from './engine';

/** What the admin panel receives: everything except the idempotency store. */
export type AdminSnapshot = Omit<AppState, 'processed'>;

export function adminSnapshot(s: AppState): AdminSnapshot {
  const { processed: _ignored, ...rest } = s;
  return structuredClone(rest);
}

export interface AgentTierView {
  name: string;
  start: number;
  end: number | null;
  rate: number | null;
}

export interface AgentCampaignView {
  campaign: Pick<
    Campaign,
    'id' | 'code' | 'name' | 'description' | 'startDate' | 'endDate' | 'status' | 'products' | 'validSaleRules' | 'tierCompletionRules' | 'payoutRules'
  > & { tiers: AgentTierView[] };
  stats: AgentCampaignStats;
  sales: Pick<Sale, 'id' | 'serial' | 'merchant' | 'product' | 'saleDate' | 'status'>[];
  payouts: Pick<Payout, 'id' | 'amount' | 'createdAt'>[];
}

export interface AgentSnapshot {
  agent: { id: string; code: string; name: string; group: string; active: boolean };
  campaigns: AgentCampaignView[];
}

/**
 * The agent's own, minimal view. It deliberately contains no budget, no other agents,
 * no internal notes and no audit log. Over a real backend this is the only thing an
 * agent token is allowed to fetch.
 */
export function agentSnapshot(s: AppState, agentId: string): AgentSnapshot | null {
  const agent = s.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const head = { id: agent.id, code: agent.code, name: agent.name, group: agent.group, active: agent.active };
  if (!agent.active) return { agent: head, campaigns: [] };
  const campaigns: AgentCampaignView[] = s.campaigns
    .filter((c) => c.status !== 'draft' && agent.campaignIds.includes(c.id))
    .map((c) => {
      const ranges = tierRanges(c.tiers);
      return {
        campaign: {
          id: c.id,
          code: c.code,
          name: c.name,
          description: c.description,
          startDate: c.startDate,
          endDate: c.endDate,
          status: c.status,
          products: c.products,
          validSaleRules: c.validSaleRules,
          tierCompletionRules: c.tierCompletionRules,
          payoutRules: c.payoutRules,
          tiers: c.tiers.map((t, i) => ({ name: t.name, start: ranges[i].start, end: t.endQty, rate: t.rate })),
        },
        stats: agentCampaignStats(s, c, agent.id),
        sales: s.sales
          .filter((x) => x.campaignId === c.id && x.agentId === agent.id)
          .map((x) => ({ id: x.id, serial: x.serial, merchant: x.merchant, product: x.product, saleDate: x.saleDate, status: x.status }))
          .reverse(),
        payouts: s.payouts
          .filter((p) => p.campaignId === c.id && p.agentId === agent.id)
          .map((p) => ({ id: p.id, amount: p.amount, createdAt: p.createdAt }))
          .reverse(),
      };
    });
  return structuredClone({ agent: head, campaigns });
}
