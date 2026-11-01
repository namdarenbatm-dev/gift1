import { ENGINE_VERSION, SCHEMA_VERSION, type Agent, type AppState, type Campaign, type Payout, type Sale } from './types';
import { addDaysIso, todayIso } from './numbers';

/**
 * Sample data for demos and manual testing only.
 * It is loaded explicitly from «تنظیمات» and is never used to pre-fill any form.
 * All names carry «نمونه» so they cannot be mistaken for real records.
 */
export function buildDemoState(now: number, seq0: number): Pick<AppState, 'campaigns' | 'agents' | 'sales' | 'payouts' | 'seq'> {
  let seq = seq0;
  const id = (p: string) => `${p}_${(++seq).toString(36)}`;
  const today = todayIso(now);
  const start = addDaysIso(today, -30);
  const end = addDaysIso(today, 30);

  const campaign: Campaign = {
    id: id('cmp'),
    code: 'DEMO-01',
    name: 'کمپین نمونه — طرح پلکانی دستگاه‌های پوز',
    description: 'داده‌ی آزمایشی برای آشنایی با سامانه. این کمپین واقعی نیست.',
    startDate: start,
    endDate: end,
    products: 'کارتخوان رومیزی، کارتخوان سیار',
    agentGroup: 'کارگزاران نمونه',
    budget: 600_000_000,
    status: 'active',
    tiers: [
      { id: id('tier'), name: 'برنزی', endQty: 50, rate: 100_000 },
      { id: id('tier'), name: 'نقره‌ای', endQty: 100, rate: 150_000 },
      { id: id('tier'), name: 'طلایی', endQty: 199, rate: 200_000 },
      { id: id('tier'), name: 'پلاتینیوم', endQty: null, rate: 300_000 },
    ],
    validSaleRules: 'فروش فقط با سریال یکتای دستگاه و پس از تأیید مدیریت معتبر است.',
    tierCompletionRules: 'هر بازه با رسیدن تعداد فروش معتبر به حدنصاب همان بازه تکمیل می‌شود.',
    payoutRules: 'پاداش بازه‌های تکمیل‌شده و دستگاه‌های سطح آخر پس از تأیید مدیریت پرداخت می‌شود.',
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  const roster: [string, number, number][] = [
    ['علی رضایی (نمونه)', 8, 3],
    ['مریم احمدی (نمونه)', 47, 0],
    ['حسین کریمی (نمونه)', 50, 0],
    ['زهرا موسوی (نمونه)', 83, 2],
    ['رضا محمدی (نمونه)', 130, 0],
    ['نگین صادقی (نمونه)', 212, 1],
  ];

  const agents: Agent[] = [];
  const sales: Sale[] = [];
  roster.forEach(([name, approved, pending], ai) => {
    const agent: Agent = {
      id: id('agt'),
      code: `AG-${String(ai + 1).padStart(3, '0')}`,
      name,
      phone: '',
      group: 'کارگزاران نمونه',
      active: true,
      campaignIds: [campaign.id],
      createdAt: now,
      version: 1,
    };
    agents.push(agent);
    const total = approved + pending;
    for (let i = 0; i < total; i++) {
      const isPending = i >= approved;
      sales.push({
        id: id('sale'),
        campaignId: campaign.id,
        agentId: agent.id,
        serial: `DM${ai + 1}${String(i + 1).padStart(4, '0')}`,
        merchant: '',
        product: i % 2 ? 'کارتخوان سیار' : 'کارتخوان رومیزی',
        saleDate: addDaysIso(start, Math.floor((i * 30) / Math.max(total, 1))),
        note: '',
        status: isPending ? 'pending' : 'approved',
        engineVersion: isPending ? null : ENGINE_VERSION,
        createdAt: now,
        reviewedAt: isPending ? null : now,
        version: isPending ? 1 : 2,
      });
    }
  });

  const payouts: Payout[] = [
    { id: id('pay'), campaignId: campaign.id, agentId: agents[2].id, amount: 5_000_000, engineVersion: ENGINE_VERSION, idempotencyKey: 'demo-pay-1', createdAt: now },
    { id: id('pay'), campaignId: campaign.id, agentId: agents[5].id, amount: 12_500_000, engineVersion: ENGINE_VERSION, idempotencyKey: 'demo-pay-2', createdAt: now },
  ];

  return { campaigns: [campaign], agents, sales, payouts, seq };
}

export const _schema = SCHEMA_VERSION;
