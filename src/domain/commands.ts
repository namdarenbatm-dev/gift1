import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type Agent,
  type AppState,
  type Campaign,
  type CampaignStatus,
  type Command,
  type CommandError,
  type CommandResult,
  type Envelope,
  type ErrorCode,
  type Issue,
  type Sale,
} from './types';
import { addDaysIso, formatInt, formatToman, isIsoDate, normalizeSerial, todayIso, toLatinDigits } from './numbers';
import { normalizeTiers, validateCampaign } from './engine';
import { agentCampaignStats, campaignAgentStats } from './ledger';
import { buildDemoState } from './demo';

const MAX_PROCESSED = 1000;
const MAX_AUDIT = 5000;

export function emptyState(): AppState {
  return {
    schema: SCHEMA_VERSION,
    version: 0,
    seq: 0,
    campaigns: [],
    agents: [],
    sales: [],
    payouts: [],
    audit: [],
    processed: {},
  };
}

/** Light structural check used when loading from storage or importing a backup. */
export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.schema === SCHEMA_VERSION &&
    typeof v.version === 'number' &&
    typeof v.seq === 'number' &&
    Array.isArray(v.campaigns) &&
    Array.isArray(v.agents) &&
    Array.isArray(v.sales) &&
    Array.isArray(v.payouts) &&
    Array.isArray(v.audit)
  );
}

/* ------------------------------------------------------------------ */

class Fail extends Error {
  constructor(public error: CommandError) {
    super(error.message);
  }
}

function fail(code: ErrorCode, message: string, extra?: Partial<CommandError>): never {
  throw new Fail({ code, message, ...extra });
}

interface Ctx {
  s: AppState;
  now: number;
  actor: string;
  key: string;
  id: (prefix: string) => string;
  audit: (action: string, entity: string, entityId: string, summary: string) => void;
}

type Handler<C extends Command> = (ctx: Ctx, cmd: C) => Record<string, string | number> | void;

const asCampaign = (s: AppState, id: string): Campaign => {
  const c = s.campaigns.find((x) => x.id === id);
  if (!c) fail('NOT_FOUND', 'کمپین پیدا نشد.');
  return c;
};
const asAgent = (s: AppState, id: string): Agent => {
  const a = s.agents.find((x) => x.id === id);
  if (!a) fail('NOT_FOUND', 'کارگزار پیدا نشد.');
  return a;
};

const sameTiers = (a: readonly { name: string; endQty: number | null; rate: number | null }[], b: typeof a) =>
  a.length === b.length && a.every((t, i) => t.name === b[i].name && t.endQty === b[i].endQty && t.rate === b[i].rate);

function throwIssues(issues: Issue[]): never {
  fail('VALIDATION', issues[0].message, { issues });
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

const handlers: { [K in Command['type']]: Handler<Extract<Command, { type: K }>> } = {
  saveCampaign(ctx, { campaign: input }) {
    const { s, now } = ctx;
    const existing = input.id ? asCampaign(s, input.id) : null;
    const mode = existing && existing.status !== 'draft' ? 'publish' : 'draft';
    const issues = validateCampaign(input, mode);
    if (issues.length) throwIssues(issues);
    const code = input.code.trim();
    if (s.campaigns.some((c) => c.id !== existing?.id && c.code.trim().toLowerCase() === code.toLowerCase())) {
      fail('DUPLICATE_CODE', 'این شناسه‌ی کمپین قبلاً استفاده شده است.', { issues: [{ field: 'code', message: 'شناسه‌ی تکراری است.' }] });
    }
    const tiers = normalizeTiers(input.tiers, () => ctx.id('tier'));
    const fields = {
      code,
      name: input.name.trim(),
      description: input.description.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      products: input.products.trim(),
      agentGroup: input.agentGroup.trim(),
      budget: input.budget,
      validSaleRules: input.validSaleRules.trim(),
      tierCompletionRules: input.tierCompletionRules.trim(),
      payoutRules: input.payoutRules.trim(),
    };
    if (existing) {
      if (s.payouts.some((p) => p.campaignId === existing.id) && !sameTiers(existing.tiers, tiers)) {
        fail('LOCKED_AFTER_PAYOUT', 'پس از ثبت پرداخت، سطح‌ها و نرخ‌های این کمپین قابل تغییر نیستند.');
      }
      Object.assign(existing, fields, { tiers, updatedAt: now, version: existing.version + 1 });
      ctx.audit('ویرایش کمپین', 'campaign', existing.id, `کمپین «${existing.name}» ویرایش شد.`);
      return { campaignId: existing.id };
    }
    const created: Campaign = {
      id: ctx.id('cmp'),
      ...fields,
      status: 'draft',
      tiers,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    s.campaigns.push(created);
    ctx.audit('ایجاد کمپین', 'campaign', created.id, `کمپین «${created.name}» به‌صورت پیش‌نویس ایجاد شد.`);
    return { campaignId: created.id };
  },

  setCampaignStatus(ctx, { campaignId, status }) {
    const c = asCampaign(ctx.s, campaignId);
    const allowed: Record<CampaignStatus, CampaignStatus[]> = {
      draft: ['active'],
      active: ['paused', 'ended'],
      paused: ['active', 'ended'],
      ended: [],
    };
    if (!allowed[c.status].includes(status)) fail('VALIDATION', 'این تغییر وضعیت برای کمپین مجاز نیست.');
    if (status === 'active') {
      const issues = validateCampaign(c, 'publish');
      if (issues.length) throwIssues(issues);
    }
    c.status = status;
    c.updatedAt = ctx.now;
    c.version += 1;
    const label = { draft: 'پیش‌نویس', active: 'فعال', paused: 'متوقف', ended: 'پایان‌یافته' }[status];
    ctx.audit('تغییر وضعیت کمپین', 'campaign', c.id, `وضعیت کمپین «${c.name}» به «${label}» تغییر کرد.`);
    return { campaignId: c.id };
  },

  saveAgent(ctx, { agent: input }) {
    const { s, now } = ctx;
    const name = input.name.trim();
    const code = input.code.trim();
    const phone = toLatinDigits(input.phone).replace(/[\s-]/g, '');
    const issues: Issue[] = [];
    if (!name) issues.push({ field: 'name', message: 'نام کارگزار را وارد کنید.' });
    if (!code) issues.push({ field: 'code', message: 'شناسه‌ی کارگزار را وارد کنید.' });
    if (phone && !/^\+?\d{7,15}$/.test(phone)) issues.push({ field: 'phone', message: 'شماره‌ی تماس معتبر نیست.' });
    if (issues.length) throwIssues(issues);
    const existing = input.id ? asAgent(s, input.id) : null;
    if (s.agents.some((a) => a.id !== existing?.id && a.code.trim().toLowerCase() === code.toLowerCase())) {
      fail('DUPLICATE_CODE', 'این شناسه‌ی کارگزار قبلاً استفاده شده است.', { issues: [{ field: 'code', message: 'شناسه‌ی تکراری است.' }] });
    }
    if (existing) {
      Object.assign(existing, { name, code, phone, group: input.group.trim(), version: existing.version + 1 });
      ctx.audit('ویرایش کارگزار', 'agent', existing.id, `مشخصات «${name}» ویرایش شد.`);
      return { agentId: existing.id };
    }
    const created: Agent = {
      id: ctx.id('agt'),
      code,
      name,
      phone,
      group: input.group.trim(),
      active: true,
      campaignIds: [],
      createdAt: now,
      version: 1,
    };
    s.agents.push(created);
    ctx.audit('ثبت کارگزار', 'agent', created.id, `کارگزار «${name}» ثبت شد.`);
    return { agentId: created.id };
  },

  setAgentActive(ctx, { agentId, active }) {
    const a = asAgent(ctx.s, agentId);
    a.active = active;
    a.version += 1;
    ctx.audit(active ? 'فعال‌سازی کارگزار' : 'غیرفعال‌سازی کارگزار', 'agent', a.id, `«${a.name}» ${active ? 'فعال' : 'غیرفعال'} شد.`);
    return { agentId: a.id };
  },

  assignAgent(ctx, { agentId, campaignId, assigned }) {
    const a = asAgent(ctx.s, agentId);
    const c = asCampaign(ctx.s, campaignId);
    const has = a.campaignIds.includes(c.id);
    if (assigned && !has) a.campaignIds.push(c.id);
    if (!assigned && has) {
      if (ctx.s.sales.some((x) => x.agentId === a.id && x.campaignId === c.id)) {
        fail('VALIDATION', 'این کارگزار در این کمپین فروش ثبت‌شده دارد و نمی‌توان او را حذف کرد.');
      }
      a.campaignIds = a.campaignIds.filter((id) => id !== c.id);
    }
    a.version += 1;
    ctx.audit('تخصیص کارگزار', 'agent', a.id, `«${a.name}» ${assigned ? 'به' : 'از'} کمپین «${c.name}» ${assigned ? 'اختصاص یافت' : 'حذف شد'}.`);
    return { agentId: a.id };
  },

  submitSale(ctx, { sale: input }) {
    const { s, now } = ctx;
    const campaign = asCampaign(s, input.campaignId);
    const agent = asAgent(s, input.agentId);
    if (campaign.status !== 'active') fail('CAMPAIGN_NOT_ACTIVE', 'فقط برای کمپین فعال می‌توان فروش ثبت کرد.');
    if (!agent.active) fail('VALIDATION', 'کارگزار غیرفعال است.');
    if (!agent.campaignIds.includes(campaign.id)) fail('VALIDATION', 'این کارگزار به کمپین انتخاب‌شده اختصاص داده نشده است.');
    const serial = normalizeSerial(input.serial);
    if (!/^[A-Z0-9/_.]{3,40}$/.test(serial)) {
      fail('VALIDATION', 'شماره‌ی سریال دستگاه باید ۳ تا ۴۰ نویسه‌ی لاتین یا رقم باشد.', { issues: [{ field: 'serial', message: 'سریال نامعتبر است.' }] });
    }
    if (!isIsoDate(input.saleDate)) fail('VALIDATION', 'تاریخ فروش معتبر نیست.', { issues: [{ field: 'saleDate', message: 'تاریخ نامعتبر است.' }] });
    if (campaign.startDate && input.saleDate < campaign.startDate) fail('VALIDATION', 'تاریخ فروش قبل از شروع کمپین است.');
    if (campaign.endDate && input.saleDate > campaign.endDate) fail('VALIDATION', 'تاریخ فروش بعد از پایان کمپین است.');
    if (input.saleDate > addDaysIso(todayIso(now), 1)) fail('VALIDATION', 'تاریخ فروش نمی‌تواند در آینده باشد.');
    const dup = s.sales.find((x) => x.campaignId === campaign.id && x.serial === serial && x.status !== 'rejected');
    if (dup) {
      const who = s.agents.find((a) => a.id === dup.agentId)?.name ?? 'کارگزار دیگر';
      fail('DUPLICATE_SALE', `این سریال قبلاً در همین کمپین برای «${who}» ثبت شده است.`, { details: { saleId: dup.id } });
    }
    const sale: Sale = {
      id: ctx.id('sale'),
      campaignId: campaign.id,
      agentId: agent.id,
      serial,
      merchant: (input.merchant ?? '').trim(),
      product: (input.product ?? '').trim(),
      saleDate: input.saleDate,
      note: (input.note ?? '').trim(),
      status: 'pending',
      engineVersion: null,
      createdAt: now,
      reviewedAt: null,
      version: 1,
    };
    s.sales.push(sale);
    ctx.audit('ثبت فروش', 'sale', sale.id, `فروش سریال ${serial} برای «${agent.name}» ثبت شد (در انتظار تأیید).`);
    return { saleId: sale.id };
  },

  reviewSale(ctx, { saleId, decision, expectedVersion }) {
    const { s, now } = ctx;
    const sale = s.sales.find((x) => x.id === saleId);
    if (!sale) fail('NOT_FOUND', 'فروش پیدا نشد.');
    if (sale.version !== expectedVersion) {
      fail('VERSION_CONFLICT', 'این فروش در این فاصله تغییر کرده است. صفحه را تازه کنید و دوباره تلاش کنید.');
    }
    const target = decision === 'approve' ? 'approved' : 'rejected';
    if (sale.status === target) fail('VALIDATION', 'این فروش قبلاً با همین وضعیت ثبت شده است.');
    const campaign = asCampaign(s, sale.campaignId);
    const agent = asAgent(s, sale.agentId);

    if (target === 'approved') {
      const dup = s.sales.find((x) => x.id !== sale.id && x.campaignId === sale.campaignId && x.serial === sale.serial && x.status !== 'rejected');
      if (dup) fail('DUPLICATE_SALE', 'سریال این فروش در همین کمپین برای فروش دیگری ثبت شده است.', { details: { saleId: dup.id } });
    } else if (sale.status === 'approved') {
      // Reversing an approved sale must never leave an agent paid more than they have earned.
      const before = agentCampaignStats(s, campaign, agent.id);
      const probe = { sales: s.sales.map((x) => (x.id === sale.id ? { ...x, status: 'rejected' as const } : x)), payouts: s.payouts };
      const after = agentCampaignStats(probe, campaign, agent.id);
      if (before.paid > after.payable) {
        fail('PAYOUT_CONFLICT', `با رد این فروش، پاداش قابل پرداخت از مبلغ پرداخت‌شده (${formatToman(before.paid)}) کمتر می‌شود. ابتدا موضوع پرداخت را بررسی کنید.`);
      }
    }
    sale.status = target;
    sale.engineVersion = target === 'approved' ? ENGINE_VERSION : null;
    sale.reviewedAt = now;
    sale.version += 1;
    ctx.audit(decision === 'approve' ? 'تأیید فروش' : 'رد فروش', 'sale', sale.id, `فروش سریال ${sale.serial} («${agent.name}») ${decision === 'approve' ? 'تأیید' : 'رد'} شد.`);
    return { saleId: sale.id, saleVersion: sale.version };
  },

  payRewards(ctx, { campaignId, agentId, amount }) {
    const { s, now } = ctx;
    const campaign = asCampaign(s, campaignId);
    const agent = asAgent(s, agentId);
    const stats = agentCampaignStats(s, campaign, agent.id);
    if (!stats.calculable) fail('VALIDATION', 'سطح‌ها و نرخ‌های این کمپین کامل نیست.');
    if (stats.unpaid <= 0) fail('NOTHING_TO_PAY', 'پاداش پرداخت‌نشده‌ای برای این کارگزار وجود ندارد.');
    const pay = amount ?? stats.unpaid;
    if (!Number.isSafeInteger(pay) || pay < 1) fail('VALIDATION', 'مبلغ پرداخت باید عدد صحیح مثبت باشد.');
    if (pay > stats.unpaid) fail('OVER_PAYMENT', `مبلغ پرداخت از پاداش پرداخت‌نشده (${formatToman(stats.unpaid)}) بیشتر است.`);
    if (campaign.budget !== null) {
      const paidTotal = s.payouts.filter((p) => p.campaignId === campaign.id).reduce((sum, p) => sum + p.amount, 0);
      if (paidTotal + pay > campaign.budget) fail('BUDGET_EXCEEDED', 'این پرداخت از بودجه‌ی کمپین فراتر می‌رود.');
    }
    const id = ctx.id('pay');
    s.payouts.push({ id, campaignId: campaign.id, agentId: agent.id, amount: pay, engineVersion: ENGINE_VERSION, idempotencyKey: ctx.key, createdAt: now });
    ctx.audit('ثبت پرداخت', 'payout', id, `${formatToman(pay)} به «${agent.name}» در کمپین «${campaign.name}» پرداخت شد.`);
    return { payoutId: id, amount: pay };
  },

  loadDemoData(ctx) {
    const { s } = ctx;
    if (s.campaigns.length || s.agents.length) fail('VALIDATION', 'داده‌ی نمونه فقط روی سامانه‌ی خالی بارگذاری می‌شود. ابتدا همه‌ی داده‌ها را پاک کنید.');
    const demo = buildDemoState(ctx.now, s.seq);
    Object.assign(s, { campaigns: demo.campaigns, agents: demo.agents, sales: demo.sales, payouts: demo.payouts, seq: demo.seq });
    ctx.audit('بارگذاری داده‌ی نمونه', 'system', 'demo', 'داده‌ی نمونه برای آزمایش بارگذاری شد.');
  },

  resetAll(ctx) {
    const keep = ctx.s.version;
    Object.assign(ctx.s, emptyState(), { version: keep, seq: ctx.s.seq });
    ctx.audit('پاک‌سازی', 'system', 'reset', `همه‌ی داده‌ها پاک شد (${formatInt(0)} کمپین، ${formatInt(0)} کارگزار).`);
  },

  importState(ctx, { state }) {
    if (!isAppState(state)) fail('VALIDATION', 'فایل پشتیبان معتبر نیست.');
    const keep = ctx.s.version;
    Object.assign(ctx.s, structuredClone(state), { processed: {}, version: keep });
    ctx.audit('بازیابی پشتیبان', 'system', 'import', 'داده‌ها از فایل پشتیبان بازیابی شد.');
  },
};

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export interface ApplyOutcome {
  state: AppState;
  result: CommandResult;
}

/**
 * The only way to change state. Pure: (state, envelope, clock) → (state, result).
 * The browser adapter, the in-memory server stub and a real backend can all call it.
 *
 *  - Idempotent: a repeated `idempotencyKey` returns the stored result and changes nothing.
 *  - Role-checked: agents cannot run any command in this release.
 *  - Atomic: if a handler fails, the previous state is returned untouched.
 */
export function applyCommand(prev: AppState, env: Envelope, now: number): ApplyOutcome {
  const stored = prev.processed[env.idempotencyKey];
  if (stored) return { state: prev, result: { ...stored, replayed: true } as CommandResult };

  if (env.actor.role === 'agent') {
    return { state: prev, result: { ok: false, error: { code: 'FORBIDDEN', message: 'کارگزار اجازه‌ی تغییر داده‌ها را ندارد.' } } };
  }
  if (env.expectedStateVersion !== undefined && env.expectedStateVersion !== prev.version) {
    return { state: prev, result: { ok: false, error: { code: 'VERSION_CONFLICT', message: 'داده‌ها در این فاصله تغییر کرده‌اند. صفحه را تازه کنید.' } } };
  }

  const s = structuredClone(prev);
  const ctx: Ctx = {
    s,
    now,
    key: env.idempotencyKey,
    actor: env.actor.role === 'admin' ? 'مدیریت' : 'سیستم',
    id: (prefix) => {
      s.seq += 1;
      return `${prefix}_${s.seq.toString(36)}`;
    },
    audit: (action, entity, entityId, summary) => {
      s.audit.push({ id: `aud_${s.audit.length + 1}_${s.version + 1}`, at: now, actor: ctx.actor, action, entity, entityId, summary });
      if (s.audit.length > MAX_AUDIT) s.audit.splice(0, s.audit.length - MAX_AUDIT);
    },
  };

  try {
    const handler = handlers[env.command.type] as Handler<Command> | undefined;
    if (!handler) fail('VALIDATION', 'دستور ناشناخته است.');
    const data = handler(ctx, env.command) ?? undefined;
    s.version += 1;
    const result: CommandResult = { ok: true, stateVersion: s.version, ...(data ? { data } : {}) };
    s.processed[env.idempotencyKey] = result;
    const keys = Object.keys(s.processed);
    if (keys.length > MAX_PROCESSED) for (const k of keys.slice(0, keys.length - MAX_PROCESSED)) delete s.processed[k];
    return { state: s, result };
  } catch (e) {
    if (e instanceof Fail) return { state: prev, result: { ok: false, error: e.error } };
    throw e;
  }
}

/** Convenience for tests and tools: all agent stats of one campaign. */
export function statsForCampaign(s: AppState, campaignId: string) {
  const c = s.campaigns.find((x) => x.id === campaignId);
  return c ? campaignAgentStats(s, c, s.agents.filter((a) => a.campaignIds.includes(c.id)).map((a) => a.id)) : new Map();
}
