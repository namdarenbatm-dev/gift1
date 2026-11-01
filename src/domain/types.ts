/**
 * Techno Campgain — domain types.
 * Everything in src/domain is pure (no DOM, no storage, no network) so the same
 * code can run in the browser, in tests and later on a real server.
 */

export const ENGINE_VERSION = '1.0.0';
export const SCHEMA_VERSION = 2;

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended';
export type SaleStatus = 'pending' | 'approved' | 'rejected';

export interface Tier {
  id: string;
  name: string;
  /** Highest device number (inclusive) that belongs to this tier. `null` = no ceiling (last tier only). */
  endQty: number | null;
  /** Reward per device, in Toman. `null` while not yet defined by the admin. */
  rate: number | null;
}

export interface Campaign {
  id: string;
  code: string;
  name: string;
  description: string;
  startDate: string; // YYYY-MM-DD (Gregorian, displayed as Jalali)
  endDate: string;
  products: string;
  agentGroup: string;
  /** Total campaign budget in Toman. `null` = no budget ceiling. */
  budget: number | null;
  status: CampaignStatus;
  tiers: Tier[];
  validSaleRules: string;
  tierCompletionRules: string;
  payoutRules: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface Agent {
  id: string;
  code: string;
  name: string;
  phone: string;
  group: string;
  active: boolean;
  campaignIds: string[];
  createdAt: number;
  version: number;
}

export interface Sale {
  id: string;
  campaignId: string;
  agentId: string;
  /** Normalised device serial; unique per campaign among non-rejected sales. */
  serial: string;
  merchant: string;
  product: string;
  saleDate: string;
  note: string;
  status: SaleStatus;
  /** Engine version that was current when the sale was approved. */
  engineVersion: string | null;
  createdAt: number;
  reviewedAt: number | null;
  version: number;
}

export interface Payout {
  id: string;
  campaignId: string;
  agentId: string;
  amount: number;
  engineVersion: string;
  idempotencyKey: string;
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
}

export interface AppState {
  schema: typeof SCHEMA_VERSION;
  /** Increases by one on every successful state-changing command. */
  version: number;
  /** Id counter, so id generation stays deterministic and server-friendly. */
  seq: number;
  campaigns: Campaign[];
  agents: Agent[];
  sales: Sale[];
  payouts: Payout[];
  audit: AuditEntry[];
  /** idempotencyKey -> stored result (bounded). */
  processed: Record<string, CommandResult>;
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

export interface TierInput {
  id?: string;
  name: string;
  endQty: number | null;
  rate: number | null;
}

export interface CampaignInput {
  id?: string;
  code: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  products: string;
  agentGroup: string;
  budget: number | null;
  tiers: TierInput[];
  validSaleRules: string;
  tierCompletionRules: string;
  payoutRules: string;
}

export interface AgentInput {
  id?: string;
  code: string;
  name: string;
  phone: string;
  group: string;
}

export interface SaleInput {
  campaignId: string;
  agentId: string;
  serial: string;
  merchant?: string;
  product?: string;
  saleDate: string;
  note?: string;
}

export type Command =
  | { type: 'saveCampaign'; campaign: CampaignInput }
  | { type: 'setCampaignStatus'; campaignId: string; status: CampaignStatus }
  | { type: 'saveAgent'; agent: AgentInput }
  | { type: 'setAgentActive'; agentId: string; active: boolean }
  | { type: 'assignAgent'; agentId: string; campaignId: string; assigned: boolean }
  | { type: 'submitSale'; sale: SaleInput }
  | { type: 'reviewSale'; saleId: string; decision: 'approve' | 'reject'; expectedVersion: number }
  | { type: 'payRewards'; campaignId: string; agentId: string; amount?: number }
  | { type: 'loadDemoData' }
  | { type: 'resetAll' }
  | { type: 'importState'; state: unknown };

export interface Actor {
  role: 'admin' | 'agent' | 'system';
  id?: string;
}

/** What travels over the wire (or into the localStorage adapter). */
export interface Envelope {
  /** A retry with the same key never repeats a side effect (e.g. a payout). */
  idempotencyKey: string;
  actor: Actor;
  command: Command;
  /** Optional optimistic-concurrency guard on the whole state. */
  expectedStateVersion?: number;
}

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'DUPLICATE_SALE'
  | 'DUPLICATE_CODE'
  | 'VERSION_CONFLICT'
  | 'CAMPAIGN_NOT_ACTIVE'
  | 'NOTHING_TO_PAY'
  | 'OVER_PAYMENT'
  | 'BUDGET_EXCEEDED'
  | 'PAYOUT_CONFLICT'
  | 'LOCKED_AFTER_PAYOUT'
  | 'STORAGE_ERROR'
  | 'NETWORK';

export interface Issue {
  field: string;
  message: string;
}

export interface CommandError {
  code: ErrorCode;
  message: string;
  issues?: Issue[];
  /** Extra machine-readable context, e.g. the id of the duplicate sale. */
  details?: Record<string, string | number>;
}

export type CommandResult =
  | { ok: true; stateVersion: number; replayed?: boolean; data?: Record<string, string | number> }
  | { ok: false; error: CommandError };
