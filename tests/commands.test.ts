import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, emptyState } from '../src/domain/commands';
import { agentSnapshot, adminSnapshot } from '../src/domain/projections';
import { agentCampaignStats, campaignTotals } from '../src/domain/ledger';
import { addApproved, campaignInput, makeWorld, mustFail, mustOk, nextKey, NOW, run, TIERS } from './helpers';

test('فرم کمپین: پیش‌نویس فقط نام و شناسه می‌خواهد، انتشار همه‌ی اطلاعات پلکان را', () => {
  const s0 = emptyState();
  mustFail(run(s0, { type: 'saveCampaign', campaign: campaignInput({ name: '' }) }), 'VALIDATION');
  const draft = run(s0, {
    type: 'saveCampaign',
    campaign: campaignInput({ startDate: '', endDate: '', tiers: TIERS.map((t) => ({ ...t, endQty: null, rate: null })) }),
  });
  const id = String(mustOk(draft).campaignId);
  mustFail(run(draft.state, { type: 'setCampaignStatus', campaignId: id, status: 'active' }), 'VALIDATION');
});

test('شناسه‌ی تکراری کمپین و کارگزار رد می‌شود', () => {
  const w = makeWorld();
  mustFail(run(w.state, { type: 'saveCampaign', campaign: campaignInput({ code: 't-01' }) }), 'DUPLICATE_CODE');
  mustFail(run(w.state, { type: 'saveAgent', agent: { code: 'ag-1', name: 'دیگری', phone: '', group: '' } }), 'DUPLICATE_CODE');
});

test('فروش تکراری شناسایی می‌شود؛ پس از رد، ثبت دوباره مجاز است', () => {
  const w = makeWorld();
  const first = run(w.state, { type: 'submitSale', sale: { campaignId: w.campaignId, agentId: w.agentId, serial: 'ab-123', saleDate: '2026-10-10' } });
  const saleId = String(mustOk(first).saleId);
  const dup = run(first.state, { type: 'submitSale', sale: { campaignId: w.campaignId, agentId: w.agentId, serial: 'AB 123', saleDate: '2026-10-11' } });
  mustFail(dup, 'DUPLICATE_SALE');
  const rej = run(first.state, { type: 'reviewSale', saleId, decision: 'reject', expectedVersion: 1 });
  mustOk(rej);
  mustOk(run(rej.state, { type: 'submitSale', sale: { campaignId: w.campaignId, agentId: w.agentId, serial: 'AB123', saleDate: '2026-10-11' } }));
});

test('اعتبارسنجی فروش: تاریخ در بازه‌ی کمپین، سریال معتبر، کارگزار تخصیص‌یافته', () => {
  const w = makeWorld();
  const base = { campaignId: w.campaignId, agentId: w.agentId, serial: 'SN0001', saleDate: '2026-10-10' };
  mustFail(run(w.state, { type: 'submitSale', sale: { ...base, saleDate: '2026-09-01' } }), 'VALIDATION');
  mustFail(run(w.state, { type: 'submitSale', sale: { ...base, saleDate: '2027-01-02' } }), 'VALIDATION');
  mustFail(run(w.state, { type: 'submitSale', sale: { ...base, saleDate: '2026-12-30' } }), 'VALIDATION'); // آینده
  mustFail(run(w.state, { type: 'submitSale', sale: { ...base, serial: '!!' } }), 'VALIDATION');
  const other = run(w.state, { type: 'saveAgent', agent: { code: 'AG-2', name: 'بدون تخصیص', phone: '', group: '' } });
  mustFail(run(other.state, { type: 'submitSale', sale: { ...base, agentId: String(mustOk(other).agentId) } }), 'VALIDATION');
});

test('تأیید با نسخه‌ی کهنه رد می‌شود (همروندی)', () => {
  const w = makeWorld();
  const sub = run(w.state, { type: 'submitSale', sale: { campaignId: w.campaignId, agentId: w.agentId, serial: 'SN0001', saleDate: '2026-10-10' } });
  const saleId = String(mustOk(sub).saleId);
  const ok = run(sub.state, { type: 'reviewSale', saleId, decision: 'approve', expectedVersion: 1 });
  mustOk(ok);
  mustFail(run(ok.state, { type: 'reviewSale', saleId, decision: 'reject', expectedVersion: 1 }), 'VERSION_CONFLICT');
  assert.equal(ok.state.sales[0].engineVersion, '1.0.0', 'نسخه‌ی موتور روی فروش تأییدشده ثبت می‌شود');
});

test('تغییر وضعیت فروش روی سطح، پاداش و خط جاری اثر می‌گذارد', () => {
  const w = makeWorld();
  const camp = () => w.state.campaigns[0];
  let state = addApproved(w, 49);
  let st = agentCampaignStats(state, camp(), w.agentId);
  assert.equal(st.levelName, 'برنزی');
  assert.equal(st.progress?.remainingToBlock, 1);
  state = addApproved({ ...w, state }, 1, 'ZZ');
  st = agentCampaignStats(state, camp(), w.agentId);
  assert.equal(st.payable, 5_000_000);
  assert.equal(st.messages[0].kind, 'complete');
  // رد یکی از فروش‌ها: سطح و پاداش برمی‌گردد
  const sale = state.sales[0];
  const rev = run(state, { type: 'reviewSale', saleId: sale.id, decision: 'reject', expectedVersion: sale.version });
  mustOk(rev);
  const after = agentCampaignStats(rev.state, camp(), w.agentId);
  assert.equal(after.approved, 49);
  assert.equal(after.payable, 0);
});

test('پرداخت: کلید یکتا از پرداخت مضاعف جلوگیری می‌کند', () => {
  const w = makeWorld();
  const state = addApproved(w, 50);
  const key = nextKey();
  const first = run(state, { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId }, { key });
  assert.equal(mustOk(first).amount, 5_000_000);
  const replay = run(first.state, { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId }, { key });
  assert.equal(replay.result.ok && replay.result.replayed, true);
  assert.equal(replay.state.payouts.length, 1, 'فقط یک پرداخت ثبت شده');
  // کلید جدید، ولی چیزی برای پرداخت نیست
  mustFail(run(first.state, { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId }), 'NOTHING_TO_PAY');
});

test('پرداخت: مبلغ بیش از پرداخت‌نشده و فراتر از بودجه رد می‌شود؛ پرداخت جزئی ممکن است', () => {
  const w = makeWorld({ budget: 6_000_000 });
  const state = addApproved(w, 50);
  mustFail(run(state, { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId, amount: 5_000_001 }), 'OVER_PAYMENT');
  const part = run(state, { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId, amount: 2_000_000 });
  mustOk(part);
  const st = agentCampaignStats(part.state, part.state.campaigns[0], w.agentId);
  assert.equal(st.paymentStatus, 'partial');
  assert.equal(st.unpaid, 3_000_000);
  const tot = campaignTotals(part.state, part.state.campaigns[0]);
  assert.equal(tot.committed, 5_000_000);
  assert.equal(tot.paid, 2_000_000);
  assert.equal(tot.remainingBudget, 1_000_000);
  // بودجه‌ی کم
  const tight = makeWorld({ budget: 4_000_000 });
  mustFail(run(addApproved(tight, 50), { type: 'payRewards', campaignId: tight.campaignId, agentId: tight.agentId }), 'BUDGET_EXCEEDED');
});

test('رد فروشی که باعث پرداخت مازاد می‌شود، متوقف می‌شود', () => {
  const w = makeWorld();
  const state = addApproved(w, 50);
  const paid = run(state, { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId });
  const sale = paid.state.sales[0];
  mustFail(run(paid.state, { type: 'reviewSale', saleId: sale.id, decision: 'reject', expectedVersion: sale.version }), 'PAYOUT_CONFLICT');
});

test('پس از ثبت پرداخت، پلکان و نرخ‌ها قفل می‌شوند', () => {
  const w = makeWorld();
  const paid = run(addApproved(w, 50), { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId });
  const c = paid.state.campaigns[0];
  const edited = campaignInput({ tiers: TIERS.map((t, i) => (i === 0 ? { ...t, rate: 999 } : { ...t })) });
  mustFail(run(paid.state, { type: 'saveCampaign', campaign: { ...edited, id: c.id } }), 'LOCKED_AFTER_PAYOUT');
  mustOk(run(paid.state, { type: 'saveCampaign', campaign: { ...campaignInput({ description: 'توضیح تازه' }), id: c.id } }));
});

test('پذیرش ۵: مدیریت می‌تواند سطح اضافه/حذف کند و نرخ را قبل از پرداخت تغییر دهد', () => {
  const w = makeWorld();
  const c = w.state.campaigns[0];
  const fiveTiers = [...TIERS.slice(0, 3), { name: 'الماس', endQty: 299, rate: 350_000 }, { name: 'سلطنتی', endQty: null, rate: 500_000 }];
  const r = run(w.state, { type: 'saveCampaign', campaign: { ...campaignInput({ tiers: fiveTiers }), id: c.id } });
  mustOk(r);
  assert.equal(r.state.campaigns[0].tiers.length, 5);
  const three = [TIERS[0], TIERS[1], { name: 'نهایی', endQty: null, rate: 1 }];
  assert.equal(run(r.state, { type: 'saveCampaign', campaign: { ...campaignInput({ tiers: three }), id: c.id } }).state.campaigns[0].tiers.length, 3);
});

test('پذیرش ۱۱: کارگزار نه دستور تغییر می‌تواند بدهد و نه داده‌ی مدیریتی ببیند', () => {
  const w = makeWorld();
  let state = addApproved(w, 10);
  const r2 = run(state, { type: 'saveAgent', agent: { code: 'AG-2', name: 'رقیب محرمانه', phone: '09120000000', group: '' } });
  state = r2.state;
  state = run(state, { type: 'assignAgent', agentId: String(mustOk(r2).agentId), campaignId: w.campaignId, assigned: true }).state;
  mustFail(run(state, { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId }, { actor: { role: 'agent', id: w.agentId } }), 'FORBIDDEN');
  const withBudget = run(state, { type: 'saveCampaign', campaign: { ...campaignInput({ budget: 777_000_000 }), id: w.campaignId } });
  const snap = agentSnapshot(withBudget.state, w.agentId)!;
  const json = JSON.stringify(snap);
  assert.ok(!json.includes('777000000'), 'بودجه نباید در نمای کارگزار باشد');
  assert.ok(!json.includes('رقیب محرمانه') && !json.includes('09120000000'), 'کارگزار دیگر نباید دیده شود');
  assert.ok(!json.includes('audit') && !json.includes('processed'));
  assert.equal(snap.campaigns[0].stats.approved, 10);
  assert.equal(snap.campaigns[0].sales.length, 10);
});

test('پیش‌نویس به کارگزار نشان داده نمی‌شود؛ کارگزار غیرفعال چیزی نمی‌بیند', () => {
  let { state, campaignId, agentId } = makeWorld();
  const draft = run(state, { type: 'saveCampaign', campaign: campaignInput({ code: 'D-2', name: 'پیش‌نویس' }) });
  state = run(draft.state, { type: 'assignAgent', agentId, campaignId: String(mustOk(draft).campaignId), assigned: true }).state;
  assert.equal(agentSnapshot(state, agentId)!.campaigns.length, 1);
  state = run(state, { type: 'setAgentActive', agentId, active: false }).state;
  assert.equal(agentSnapshot(state, agentId)!.campaigns.length, 0);
  assert.equal(agentSnapshot(state, 'nope'), null);
  void campaignId;
});

test('پذیرش ۱۰: متن خط جاری در نمای کارگزار و مدیریت یکسان است', () => {
  const w = makeWorld();
  const state = addApproved(w, 30);
  const adminSide = agentCampaignStats(adminSnapshot(state), state.campaigns[0], w.agentId).messages.map((m) => m.text);
  const agentSide = agentSnapshot(state, w.agentId)!.campaigns[0].stats.messages.map((m) => m.text);
  assert.deepEqual(agentSide, adminSide);
  assert.ok(agentSide.length >= 3);
});

test('کمپین‌های مستقل: فروش و پاداش هر کمپین جداست', () => {
  const w = makeWorld();
  const second = run(w.state, { type: 'saveCampaign', campaign: campaignInput({ code: 'T-02', name: 'کمپین دوم', tiers: [{ name: 'تک', endQty: null, rate: 1000 }] }) });
  const id2 = String(mustOk(second).campaignId);
  let state = run(second.state, { type: 'assignAgent', agentId: w.agentId, campaignId: id2, assigned: true }).state;
  state = run(state, { type: 'setCampaignStatus', campaignId: id2, status: 'active' }).state;
  state = addApproved({ ...w, state }, 5);
  const sub = run(state, { type: 'submitSale', sale: { campaignId: id2, agentId: w.agentId, serial: 'SN00001', saleDate: '2026-10-10' } });
  mustOk(sub); // همان سریال در کمپین دیگر مجاز است؛ یکتایی در سطح هر کمپین است
  const s1 = agentCampaignStats(sub.state, sub.state.campaigns[0], w.agentId);
  const s2 = agentCampaignStats(sub.state, sub.state.campaigns[1], w.agentId);
  assert.equal(s1.approved, 5);
  assert.equal(s2.approved, 0);
  assert.equal(s2.pending, 1);
});

test('داده‌ی نمونه فقط روی سامانه‌ی خالی بارگذاری می‌شود و پاک‌سازی کامل است', () => {
  const loaded = run(emptyState(), { type: 'loadDemoData' });
  mustOk(loaded);
  assert.equal(loaded.state.campaigns.length, 1);
  assert.ok(loaded.state.agents.every((a) => a.name.includes('نمونه')));
  mustFail(run(loaded.state, { type: 'loadDemoData' }), 'VALIDATION');
  const reset = run(loaded.state, { type: 'resetAll' });
  assert.equal(reset.state.campaigns.length + reset.state.agents.length + reset.state.sales.length + reset.state.payouts.length, 0);
  // آزمون پشتیبان
  const imported = run(reset.state, { type: 'importState', state: JSON.parse(JSON.stringify(adminSnapshot(loaded.state))) });
  mustOk(imported);
  assert.equal(imported.state.sales.length, loaded.state.sales.length);
  mustFail(run(reset.state, { type: 'importState', state: { schema: 1 } }), 'VALIDATION');
});

test('شناسه‌ها قطعی و بدون برخورد تولید می‌شوند', () => {
  const w = makeWorld();
  const state = addApproved(w, 20);
  const ids = [...state.campaigns.map((x) => x.id), ...state.agents.map((x) => x.id), ...state.sales.map((x) => x.id), ...state.campaigns[0].tiers.map((t) => t.id)];
  assert.equal(new Set(ids).size, ids.length);
});

test('دستور ناموفق، وضعیت را دست‌نخورده نگه می‌دارد (اتمیک)', () => {
  const w = makeWorld();
  const before = JSON.stringify(w.state);
  const r = applyCommand(w.state, { idempotencyKey: nextKey(), actor: { role: 'admin' }, command: { type: 'payRewards', campaignId: w.campaignId, agentId: w.agentId } }, NOW);
  assert.equal(r.result.ok, false);
  assert.equal(JSON.stringify(r.state), before);
});
