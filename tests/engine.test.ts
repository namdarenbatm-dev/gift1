import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressFor, rewardBreakdown, validateTiers, isCalculable } from '../src/domain/engine';
import { buildTicker } from '../src/domain/ticker';
import { formatInt, formatToman, parseIntegerInput, normalizeSerial, formatDate } from '../src/domain/numbers';
import { toCsv } from '../src/domain/csv';
import { TIERS } from './helpers';

const tiers = TIERS.map((t, i) => ({ id: `t${i}`, ...t }));

test('پذیرش ۶: مجموع پاداش = مجموع (دستگاه‌های هر بازه × نرخ همان بازه)', () => {
  assert.equal(rewardBreakdown(tiers, 0).totalReward, 0);
  assert.equal(rewardBreakdown(tiers, 50).totalReward, 5_000_000);
  assert.equal(rewardBreakdown(tiers, 75).totalReward, 5_000_000 + 25 * 150_000);
  assert.equal(rewardBreakdown(tiers, 199).totalReward, 5_000_000 + 7_500_000 + 99 * 200_000);
  assert.equal(rewardBreakdown(tiers, 200).totalReward, 5_000_000 + 7_500_000 + 19_800_000 + 300_000);
});

test('پذیرش ۷: هر دستگاه فقط در یک بازه محاسبه می‌شود و بازه‌های پایین‌تر دوباره قیمت‌گذاری نمی‌شوند', () => {
  for (let n = 0; n <= 320; n++) {
    const b = rewardBreakdown(tiers, n);
    assert.equal(b.rows.reduce((s, r) => s + r.count, 0), n, `Σcount at ${n}`);
    if (n > 0) {
      const next = rewardBreakdown(tiers, n + 1);
      const tierOfNext = n + 1 <= 50 ? 0 : n + 1 <= 100 ? 1 : n + 1 <= 199 ? 2 : 3;
      assert.equal(next.totalReward - b.totalReward, tiers[tierOfNext].rate, `marginal reward of device ${n + 1}`);
    }
  }
});

test('پذیرش ۸: عبور از آخرین حدنصاب، نرخ سطح آخر را برای دستگاه‌های بعدی ادامه می‌دهد', () => {
  const b = rewardBreakdown(tiers, 250);
  assert.equal(b.rows[3].count, 51);
  assert.equal(b.rows[3].reward, 51 * 300_000);
  assert.equal(b.totalReward, 5_000_000 + 7_500_000 + 19_800_000 + 51 * 300_000);
  assert.equal(b.payable, b.totalReward, 'all tiers are payable once the last one is open');
});

test('پذیرش ۵: تغییر نرخ یک سطح فقط همان سطح را تغییر می‌دهد', () => {
  const changed = tiers.map((t, i) => (i === 1 ? { ...t, rate: 175_000 } : t));
  const a = rewardBreakdown(tiers, 130);
  const b = rewardBreakdown(changed, 130);
  assert.equal(a.rows[0].reward, b.rows[0].reward);
  assert.equal(a.rows[2].reward, b.rows[2].reward);
  assert.equal(b.rows[1].reward, 50 * 175_000);
});

test('پاداش قابل پرداخت و در حال تکمیل جدا هستند', () => {
  const b = rewardBreakdown(tiers, 75);
  assert.equal(b.payable, 5_000_000);
  assert.equal(b.accruing, 25 * 150_000);
  assert.equal(b.rows[1].blockReward, 50 * 150_000);
});

test('ساخت پلکان: تعداد سطوح و حدنصاب‌ها قابل تغییر است (۲ تا ۶ سطح)', () => {
  const two = [
    { name: 'پایه', endQty: 10, rate: 1000 },
    { name: 'ویژه', endQty: null, rate: 2000 },
  ];
  assert.equal(isCalculable(two), true);
  assert.equal(rewardBreakdown(two, 15).totalReward, 10 * 1000 + 5 * 2000);
  const six = Array.from({ length: 6 }, (_, i) => ({ name: `س${i + 1}`, endQty: i === 5 ? null : (i + 1) * 10, rate: (i + 1) * 100 }));
  assert.equal(isCalculable(six), true);
  assert.equal(rewardBreakdown(six, 65).rows.reduce((s, r) => s + r.count, 0), 65);
});

test('اعتبارسنجی پلکان', () => {
  assert.equal(validateTiers([]).length > 0, true);
  assert.equal(isCalculable([{ name: 'a', endQty: 10, rate: 1 }]), false, 'last tier must be open');
  assert.equal(isCalculable([{ name: 'a', endQty: 10, rate: 1 }, { name: 'b', endQty: 10, rate: 1 }, { name: 'c', endQty: null, rate: 1 }]), false, 'ends must increase');
  assert.equal(isCalculable([{ name: 'a', endQty: null, rate: null }]), false, 'rate is required');
  assert.equal(isCalculable([{ name: '', endQty: null, rate: 5 }]), false, 'name is required');
  assert.equal(isCalculable([{ name: 'a', endQty: 5, rate: -1 }, { name: 'b', endQty: null, rate: 1 }]), false, 'negative rate');
});

test('وضعیت پیشرفت در مرز سطح‌ها', () => {
  const p0 = progressFor(tiers, 0);
  assert.equal(p0.levelIndex, -1);
  assert.equal(p0.blockIndex, 0);
  assert.equal(p0.remainingToBlock, 50);
  assert.equal(p0.toNextLevel, 1);
  const p50 = progressFor(tiers, 50);
  assert.equal(p50.levelIndex, 0);
  assert.equal(p50.justCompletedIndex, 0);
  assert.equal(p50.blockIndex, 1);
  assert.equal(p50.toNextLevel, 1);
  const p51 = progressFor(tiers, 51);
  assert.equal(p51.levelIndex, 1);
  assert.equal(p51.justCompletedIndex, null);
  assert.equal(p51.remainingToBlock, 49);
  const p200 = progressFor(tiers, 200);
  assert.equal(p200.atTopLevel, true);
  assert.equal(p200.nextLevelIndex, null);
  assert.equal(p200.remainingToBlock, null);
});

test('پذیرش ۹: خط جاری فروش با تغییر تعداد فروش به‌روز می‌شود', () => {
  const a = buildTicker(tiers, 30).map((m) => m.text).join('|');
  const b = buildTicker(tiers, 31).map((m) => m.text).join('|');
  assert.notEqual(a, b);
  assert.match(buildTicker(tiers, 30)[0].text, /^فقط ۲۰ فروش معتبر دیگر تا تکمیل بازه برنزی باقی‌مانده است\./);
  assert.match(buildTicker(tiers, 31)[0].text, /^فقط ۱۹ فروش معتبر/);
});

test('متن پیام اول شامل مبلغ پاداش بازه‌ی جاری است (محاسبه‌شده، نه ثابت)', () => {
  assert.ok(buildTicker(tiers, 30)[0].text.includes('۵٬۰۰۰٬۰۰۰ تومان'));
  const other = tiers.map((t, i) => (i === 0 ? { ...t, rate: 120_000 } : t));
  assert.ok(buildTicker(other, 30)[0].text.includes('۶٬۰۰۰٬۰۰۰ تومان'));
});

test('پیام چهارم و پنجم', () => {
  assert.equal(buildTicker(tiers, 50)[0].kind, 'complete');
  assert.match(buildTicker(tiers, 50)[0].text, /^تبریک! حدنصاب سطح برنزی را تکمیل کردید\./);
  const top = buildTicker(tiers, 250);
  assert.deepEqual(top.map((m) => m.kind), ['top']);
  assert.ok(top[0].text.includes('پلاتینیوم') && top[0].text.includes('۳۰۰٬۰۰۰ تومان'));
});

test('پیام ترکیبی', () => {
  const m = buildTicker(tiers, 30).find((x) => x.kind === 'combo');
  assert.ok(m);
  assert.equal(m.text, 'با ۲۰ فروش دیگر، پاداش بازه جاری را تکمیل می‌کنید. برای رسیدن به سطح نقره‌ای نیز ۲۱ فروش معتبر نیاز دارید.');
});

test('اگر حدنصاب یا نرخ تعریف نشده باشد، پیام نامعتبر تولید نمی‌شود', () => {
  assert.deepEqual(buildTicker([{ id: 'a', name: 'الف', endQty: 10, rate: null }, { id: 'b', name: 'ب', endQty: null, rate: 5 }], 3), []);
  assert.deepEqual(buildTicker([], 3), []);
});

test('ورودی عددی: ارقام فارسی، جداکننده، منفی و نامعتبر', () => {
  assert.deepEqual(parseIntegerInput('۱٬۲۰۰٬۰۰۰'), { ok: true, value: 1_200_000 });
  assert.deepEqual(parseIntegerInput('1,200,000'), { ok: true, value: 1_200_000 });
  assert.deepEqual(parseIntegerInput(''), { ok: true, value: null });
  assert.equal(parseIntegerInput('-5').ok, false);
  assert.equal(parseIntegerInput('12.5').ok, false);
  assert.equal(parseIntegerInput('abc').ok, false);
  assert.equal(parseIntegerInput('99999999999999999999').ok, false);
  const shown = formatInt(1_234_567);
  assert.equal(shown, '۱٬۲۳۴٬۵۶۷');
  assert.deepEqual(parseIntegerInput(shown), { ok: true, value: 1_234_567 }, 'formatted text parses back to the same number');
  assert.equal(formatToman(5_000_000), '۵٬۰۰۰٬۰۰۰ تومان');
  assert.equal(formatToman(null), '—');
});

test('سریال دستگاه و تاریخ', () => {
  assert.equal(normalizeSerial(' ab-12 ۳۴ '), 'AB1234');
  assert.match(formatDate('2026-10-30'), /^۱۴۰۵\/۰۸\/۰۸$/);
  assert.equal(formatDate('bad'), '—');
});

test('CSV: BOM، نقل‌قول و جلوگیری از تزریق فرمول', () => {
  const csv = toCsv([['نام', 'عدد'], ['=SUM(A1)', 5], ['a"b', null]]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes(`"'=SUM(A1)","5"`));
  assert.ok(csv.includes('"a""b",'));
});

test('تقویم شمسی: تبدیل رفت‌وبرگشتی و تاریخ‌های مرزی', async () => {
  const { isoToJalali, jalaliToIso, formatDateLatin } = await import('../src/domain/numbers');
  assert.deepEqual(isoToJalali('2026-03-21'), { y: 1405, m: 1, d: 1 });
  assert.equal(jalaliToIso(1405, 1, 1), '2026-03-21');
  assert.equal(jalaliToIso(1405, 8, 9), '2026-10-31');
  assert.equal(formatDateLatin('2026-10-31'), '1405/08/09');
  assert.equal(jalaliToIso(1405, 7, 31), null, 'مهر ۳۰ روز است');
  assert.equal(jalaliToIso(1403, 12, 30), '2025-03-20', 'سال کبیسه');
  assert.equal(jalaliToIso(1404, 12, 30), null, 'سال غیرکبیسه');
  for (let i = 0; i < 4000; i += 7) {
    const d = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    const j = isoToJalali(d)!;
    assert.equal(jalaliToIso(j.y, j.m, j.d), d);
  }
});
