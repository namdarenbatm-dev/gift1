/**
 * Repository contract tests.
 * The SAME suite runs unchanged against three adapters:
 *   1. localStorage (pilot)         2. in-memory server stub          3. HTTP + a real network hop
 * If a test needs to be edited for one adapter, the contract is not swap-ready.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStorageRepository, type StorageLike } from '../src/data/localStorageRepository';
import { createMemoryRepository } from '../src/data/memoryRepository';
import { createHttpRepository } from '../src/data/httpRepository';
import { envelope, type Repository } from '../src/data/repository';
import { startReferenceServer } from '../server/reference-server';
import type { Command, CommandResult } from '../src/domain/types';
import { campaignInput, NOW, TIERS } from './helpers';

const ok = (r: CommandResult) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as Extract<CommandResult, { ok: true }>).data ?? {};
};
const code = (r: CommandResult) => (r.ok ? 'OK' : r.error.code);

function fakeStorage(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

async function exec(repo: Repository, command: Command, actor: 'admin' | 'agent' = 'admin') {
  return repo.execute(envelope(command, { role: actor }));
}

async function seed(repo: Repository, saleCount = 0) {
  await exec(repo, { type: 'resetAll' });
  const campaignId = String(ok(await exec(repo, { type: 'saveCampaign', campaign: campaignInput({ budget: 50_000_000 }) })).campaignId);
  const agentId = String(ok(await exec(repo, { type: 'saveAgent', agent: { code: 'AG-1', name: 'کارگزار یک', phone: '', group: '' } })).agentId);
  ok(await exec(repo, { type: 'assignAgent', agentId, campaignId, assigned: true }));
  ok(await exec(repo, { type: 'setCampaignStatus', campaignId, status: 'active' }));
  for (let i = 0; i < saleCount; i++) {
    const saleId = String(ok(await exec(repo, { type: 'submitSale', sale: { campaignId, agentId, serial: `SN${i + 1000}`, saleDate: '2026-10-10' } })).saleId);
    ok(await exec(repo, { type: 'reviewSale', saleId, decision: 'approve', expectedVersion: 1 }));
  }
  return { campaignId, agentId };
}

function contract(name: string, make: () => Promise<{ repo: Repository; stop?: () => Promise<void> }>) {
  describe(`قرارداد repository — ${name}`, () => {
    let repo: Repository;
    let stop: (() => Promise<void>) | undefined;
    before(async () => ({ repo, stop } = await make()));
    after(async () => stop?.());

    test('جریان کامل: کمپین → کارگزار → فروش → تأیید → پرداخت', async () => {
      const { campaignId, agentId } = await seed(repo, 50);
      const admin = await repo.getAdminSnapshot();
      assert.equal(admin.sales.filter((s) => s.status === 'approved').length, 50);
      assert.ok(!('processed' in admin));
      const pay = await exec(repo, { type: 'payRewards', campaignId, agentId });
      assert.equal(ok(pay).amount, 5_000_000);
      const snap = await repo.getAgentSnapshot(agentId);
      assert.equal(snap?.campaigns[0].stats.paymentStatus, 'paid');
      assert.equal(snap?.campaigns[0].payouts.length, 1);
    });

    test('تلاش دوباره با همان پاکت، پرداخت مضاعف ثبت نمی‌کند', async () => {
      const { campaignId, agentId } = await seed(repo, 50);
      const env = envelope({ type: 'payRewards', campaignId, agentId });
      const first = await repo.execute(env);
      const retry = await repo.execute(env); // مثل زمانی که پاسخ شبکه گم شده است
      assert.equal(ok(first).amount, ok(retry).amount);
      assert.equal(retry.ok && retry.replayed, true);
      assert.equal((await repo.getAdminSnapshot()).payouts.length, 1);
      assert.equal(code(await exec(repo, { type: 'payRewards', campaignId, agentId })), 'NOTHING_TO_PAY');
    });

    test('تأیید با نسخه‌ی کهنه VERSION_CONFLICT می‌دهد', async () => {
      const { campaignId, agentId } = await seed(repo);
      const saleId = String(ok(await exec(repo, { type: 'submitSale', sale: { campaignId, agentId, serial: 'ABC123', saleDate: '2026-10-10' } })).saleId);
      ok(await exec(repo, { type: 'reviewSale', saleId, decision: 'approve', expectedVersion: 1 }));
      assert.equal(code(await exec(repo, { type: 'reviewSale', saleId, decision: 'reject', expectedVersion: 1 })), 'VERSION_CONFLICT');
    });

    test('سریال تکراری DUPLICATE_SALE می‌دهد', async () => {
      const { campaignId, agentId } = await seed(repo);
      ok(await exec(repo, { type: 'submitSale', sale: { campaignId, agentId, serial: 'DUP-1', saleDate: '2026-10-10' } }));
      assert.equal(code(await exec(repo, { type: 'submitSale', sale: { campaignId, agentId, serial: 'dup1', saleDate: '2026-10-10' } })), 'DUPLICATE_SALE');
    });

    test('نمای کارگزار: بدون بودجه و بدون کارگزاران دیگر؛ و کارگزار نمی‌تواند دستور بدهد', async () => {
      const { campaignId, agentId } = await seed(repo, 10);
      const other = String(ok(await exec(repo, { type: 'saveAgent', agent: { code: 'AG-2', name: 'کارگزار محرمانه', phone: '', group: '' } })).agentId);
      void other;
      const json = JSON.stringify(await repo.getAgentSnapshot(agentId));
      assert.ok(!json.includes('50000000') && !json.includes('کارگزار محرمانه'));
      assert.equal(code(await exec(repo, { type: 'payRewards', campaignId, agentId }, 'agent')), 'FORBIDDEN');
      assert.equal(await repo.getAgentSnapshot('ghost'), null);
    });

    test('پس از ثبت پرداخت، پلکان قفل است (قانون سمت سرور)', async () => {
      const { campaignId, agentId } = await seed(repo, 50);
      ok(await exec(repo, { type: 'payRewards', campaignId, agentId }));
      const edited = campaignInput({ id: campaignId, budget: 50_000_000, tiers: TIERS.map((t, i) => (i ? { ...t } : { ...t, rate: 1 })) } as never);
      assert.equal(code(await exec(repo, { type: 'saveCampaign', campaign: edited })), 'LOCKED_AFTER_PAYOUT');
    });
  });
}

contract('localStorage', async () => ({ repo: createLocalStorageRepository(fakeStorage(), 'k', () => NOW) }));
contract('حافظه (شبیه‌ساز سرور با تأخیر)', async () => ({ repo: createMemoryRepository({ latencyMs: 2, clock: () => NOW }) }));
contract('HTTP روی شبکه‌ی واقعی', async () => {
  const srv = await startReferenceServer(0, () => NOW);
  return { repo: createHttpRepository({ baseUrl: srv.url }), stop: srv.close };
});

describe('رفتار ویژه‌ی localStorage', () => {
  test('داده‌ی خراب قرنطینه می‌شود و برنامه با وضعیت خالی بالا می‌آید', async () => {
    const st = fakeStorage();
    st.setItem('k', '{not json');
    const repo = createLocalStorageRepository(st, 'k', () => NOW);
    const snap = await repo.getAdminSnapshot();
    assert.equal(snap.campaigns.length, 0);
    assert.equal(st.getItem('k'), null);
    assert.ok(Array.from({ length: 1 }).length === 1);
  });

  test('پر بودن حافظه: خطای STORAGE_ERROR و عدم تغییر داده', async () => {
    const m = new Map<string, string>();
    let full = false;
    const st: StorageLike = {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => {
        if (full) throw new Error('QuotaExceededError');
        m.set(k, v);
      },
      removeItem: (k) => void m.delete(k),
    };
    const repo = createLocalStorageRepository(st, 'k', () => NOW);
    ok(await exec(repo, { type: 'saveAgent', agent: { code: 'A', name: 'الف', phone: '', group: '' } }));
    full = true;
    assert.equal(code(await exec(repo, { type: 'saveAgent', agent: { code: 'B', name: 'ب', phone: '', group: '' } })), 'STORAGE_ERROR');
    full = false;
    assert.equal((await repo.getAdminSnapshot()).agents.length, 1);
  });

  test('دو تب هم‌زمان یکدیگر را با داده‌ی کهنه بازنویسی نمی‌کنند', async () => {
    const st = fakeStorage();
    const tabA = createLocalStorageRepository(st, 'k', () => NOW);
    const tabB = createLocalStorageRepository(st, 'k', () => NOW);
    ok(await exec(tabA, { type: 'saveAgent', agent: { code: 'A', name: 'الف', phone: '', group: '' } }));
    ok(await exec(tabB, { type: 'saveAgent', agent: { code: 'B', name: 'ب', phone: '', group: '' } }));
    assert.equal((await tabA.getAdminSnapshot()).agents.length, 2);
  });
});
