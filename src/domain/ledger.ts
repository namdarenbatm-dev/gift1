import type { AppState, Campaign, Sale } from './types';
import { isCalculable, progressFor, rewardBreakdown, tierRanges } from './engine';
import type { Progress, RewardBreakdown } from './engine';
import { buildTicker } from './ticker';
import type { TickerMessage } from './ticker';

export type PaymentStatus = 'none' | 'unpaid' | 'partial' | 'paid' | 'overpaid';

export interface AgentCampaignStats {
  agentId: string;
  campaignId: string;
  approved: number;
  pending: number;
  rejected: number;
  calculable: boolean;
  levelIndex: number;
  levelName: string | null;
  breakdown: RewardBreakdown | null;
  progress: Progress | null;
  /** Σ reward of all valid sales (finished + accruing). */
  totalReward: number;
  /** Reward that is due for payment now. */
  payable: number;
  /** Reward of the block that is still being filled. */
  accruing: number;
  paid: number;
  unpaid: number;
  /** > 0 when payouts exceed what is currently payable (e.g. after a sale was reversed). */
  overpaid: number;
  paymentStatus: PaymentStatus;
  /** Progress inside the current block, 0–100; `null` for the open tier or when not calculable. */
  blockPercent: number | null;
  messages: TickerMessage[];
}

type Ledger = Pick<AppState, 'sales' | 'payouts'>;

interface Counts {
  approved: number;
  pending: number;
  rejected: number;
}

function countSales(sales: readonly Sale[], campaignId: string): Map<string, Counts> {
  const map = new Map<string, Counts>();
  for (const s of sales) {
    if (s.campaignId !== campaignId) continue;
    let c = map.get(s.agentId);
    if (!c) map.set(s.agentId, (c = { approved: 0, pending: 0, rejected: 0 }));
    c[s.status] += 1;
  }
  return map;
}

function paidByAgent(ledger: Ledger, campaignId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of ledger.payouts) {
    if (p.campaignId !== campaignId) continue;
    map.set(p.agentId, (map.get(p.agentId) ?? 0) + p.amount);
  }
  return map;
}

function computeStats(campaign: Campaign, agentId: string, counts: Counts, paid: number): AgentCampaignStats {
  const calculable = isCalculable(campaign.tiers);
  const breakdown = calculable ? rewardBreakdown(campaign.tiers, counts.approved) : null;
  const progress = calculable ? progressFor(campaign.tiers, counts.approved) : null;
  const payable = breakdown?.payable ?? 0;
  const unpaid = Math.max(0, payable - paid);
  const overpaid = Math.max(0, paid - payable);
  let paymentStatus: PaymentStatus = 'none';
  if (overpaid > 0) paymentStatus = 'overpaid';
  else if (payable === 0 && paid === 0) paymentStatus = 'none';
  else if (unpaid === 0) paymentStatus = 'paid';
  else if (paid > 0) paymentStatus = 'partial';
  else paymentStatus = 'unpaid';

  let blockPercent: number | null = null;
  if (progress && progress.remainingToBlock !== null) {
    const r = tierRanges(campaign.tiers)[progress.blockIndex];
    const size = (r.end as number) - r.start + 1;
    blockPercent = Math.round(((counts.approved - (r.start - 1)) / size) * 100);
  }
  return {
    agentId,
    campaignId: campaign.id,
    approved: counts.approved,
    pending: counts.pending,
    rejected: counts.rejected,
    calculable,
    levelIndex: progress?.levelIndex ?? -1,
    levelName: progress && progress.levelIndex >= 0 ? campaign.tiers[progress.levelIndex].name : null,
    breakdown,
    progress,
    totalReward: breakdown?.totalReward ?? 0,
    payable,
    accruing: breakdown?.accruing ?? 0,
    paid,
    unpaid,
    overpaid,
    paymentStatus,
    blockPercent,
    messages: calculable ? buildTicker(campaign.tiers, counts.approved) : [],
  };
}

const ZERO: Counts = { approved: 0, pending: 0, rejected: 0 };

export function agentCampaignStats(ledger: Ledger, campaign: Campaign, agentId: string): AgentCampaignStats {
  const counts = { ...ZERO };
  let paid = 0;
  for (const s of ledger.sales) if (s.campaignId === campaign.id && s.agentId === agentId) counts[s.status] += 1;
  for (const p of ledger.payouts) if (p.campaignId === campaign.id && p.agentId === agentId) paid += p.amount;
  return computeStats(campaign, agentId, counts, paid);
}

/** One pass over the ledger for the whole campaign — use this for lists. */
export function campaignAgentStats(
  ledger: Ledger,
  campaign: Campaign,
  agentIds: readonly string[],
): Map<string, AgentCampaignStats> {
  const counts = countSales(ledger.sales, campaign.id);
  const paid = paidByAgent(ledger, campaign.id);
  const out = new Map<string, AgentCampaignStats>();
  const ids = new Set(agentIds);
  counts.forEach((_, id) => ids.add(id));
  ids.forEach((id) => out.set(id, computeStats(campaign, id, counts.get(id) ?? ZERO, paid.get(id) ?? 0)));
  return out;
}

export interface CampaignTotals {
  approved: number;
  pending: number;
  rejected: number;
  agentsWithSales: number;
  /** Σ payable rewards: money the company has committed to pay. */
  committed: number;
  accruing: number;
  paid: number;
  unpaid: number;
  budget: number | null;
  /** budget − committed; `null` when the campaign has no budget ceiling. */
  remainingBudget: number | null;
  /** budget − paid. */
  remainingCash: number | null;
}

export function campaignTotals(ledger: Ledger, campaign: Campaign): CampaignTotals {
  const stats = campaignAgentStats(ledger, campaign, []);
  const t: CampaignTotals = {
    approved: 0,
    pending: 0,
    rejected: 0,
    agentsWithSales: 0,
    committed: 0,
    accruing: 0,
    paid: 0,
    unpaid: 0,
    budget: campaign.budget,
    remainingBudget: null,
    remainingCash: null,
  };
  stats.forEach((s) => {
    t.approved += s.approved;
    t.pending += s.pending;
    t.rejected += s.rejected;
    if (s.approved > 0) t.agentsWithSales += 1;
    t.committed += s.payable;
    t.accruing += s.accruing;
    t.paid += s.paid;
    t.unpaid += s.unpaid;
  });
  if (campaign.budget !== null) {
    t.remainingBudget = campaign.budget - t.committed;
    t.remainingCash = campaign.budget - t.paid;
  }
  return t;
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  none: 'بدون پاداش',
  unpaid: 'پرداخت‌نشده',
  partial: 'پرداخت ناقص',
  paid: 'پرداخت‌شده',
  overpaid: 'پرداخت مازاد',
};
