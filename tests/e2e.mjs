// E2E against the built docs/ (run `npm run build` first). Uses the globally available Playwright.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = '/techno-campgain/'; // simulate GitHub Pages project path
const PORT = 4179;
const URL = `http://localhost:${PORT}${BASE}`;
mkdirSync('tests/screenshots', { recursive: true });
const srv = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT), BASE }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
let failed = 0;
const errors = [];
async function t(name, fn) {
  try { await fn(); console.log('✓', name); } catch (e) { failed++; await p.screenshot({ path: `tests/screenshots/FAIL-${failed}.png` }).catch(() => {}); console.log('✗', name, '\n   ', e.message.split('\n')[0]); }
}
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', serviceWorkers: 'allow' });
const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
p.on('pageerror', (e) => errors.push('PAGEERR ' + e.message));
p.setDefaultTimeout(6000);
const fillNum = async (label, v) => { const el = p.getByLabel(label, { exact: true }); await el.click(); await el.fill(''); await el.pressSequentially(v); };

await t('splash lasts ~5s with logo, title and app name', async () => {
  const t0 = Date.now();
  await p.goto(URL);
  await p.waitForSelector('.splash');
  assert.ok(await p.$eval('.splash-logo', (i) => i.complete && i.naturalWidth > 0), 'logo');
  assert.match(await p.innerText('.splash h1'), /سامانه طراحی و مدیریت کمپین‌های فروش توسن تکنو/);
  assert.equal((await p.innerText('.splash-app')).trim(), 'Techno Campgain');
  await p.waitForSelector('.gate', { timeout: 9000 });
  const ms = Date.now() - t0;
  assert.ok(ms >= 4900 && ms < 6500, `splash ${ms}ms`);
});
await t('gate offers admin and agent entries', async () => {
  await p.getByText('ورود به پنل مدیریت').waitFor(); await p.getByText('ورود به پنل کارگزار').waitFor();
  await p.screenshot({ path: 'tests/screenshots/mobile-gate.png' });
});
await t('numeric fields start empty; negatives/letters blocked; thousands separators', async () => {
  await p.getByText('ورود به پنل مدیریت').click();
  await p.goto(URL + '#/admin/campaigns/new'); await p.waitForSelector('#c-name');
  for (const sel of ['#c-budget', '#c-sample']) assert.equal(await p.inputValue(sel), '', sel);
  for (const l of ['حدنصاب سطح ۱', 'نرخ پاداش سطح ۱']) assert.equal(await p.getByLabel(l, { exact: true }).inputValue(), '', l);
  await fillNum('نرخ پاداش سطح ۱', '-5abc'); assert.equal(await p.getByLabel('نرخ پاداش سطح ۱', { exact: true }).inputValue(), '۵');
  await fillNum('نرخ پاداش سطح ۱', '1500000'); assert.equal(await p.getByLabel('نرخ پاداش سطح ۱', { exact: true }).inputValue(), '۱٬۵۰۰٬۰۰۰');
  await fillNum('نرخ پاداش سطح ۱', '');
});
await t('build a 3-tier campaign, live preview = Σ(devices × rate), publish', async () => {
  await p.fill('#c-name', 'کمپین آزمون'); await p.fill('#c-code', 'T-1');
  const jd = async (label, y, m, d) => { await p.getByLabel(`${label} — سال`).selectOption(String(y)); await p.getByLabel(`${label} — ماه`).selectOption(String(m)); await p.getByLabel(`${label} — روز`).selectOption(String(d)); };
  await jd('تاریخ شروع', 1405, 1, 11); await jd('تاریخ پایان', 1405, 12, 29);
  assert.equal(await p.locator('input[type=date]').count(), 0, 'no Gregorian date inputs');
  assert.equal(await p.locator('.tier-row').count(), 4, 'suggested 4 tiers');
  await p.getByRole('button', { name: 'افزودن سطح' }).click(); assert.equal(await p.locator('.tier-row').count(), 5);
  await p.getByLabel('حذف سطح ۵', { exact: true }).click(); assert.equal(await p.locator('.tier-row').count(), 4);
  await fillNum('حدنصاب سطح ۱', '10'); await fillNum('حدنصاب سطح ۲', '20'); await fillNum('حدنصاب سطح ۳', '30');
  for (const [i, r] of [[1, '100000'], [2, '150000'], [3, '200000'], [4, '250000']]) await fillNum(`نرخ پاداش سطح ${'۰۱۲۳۴'[i]}`, r);
  await p.locator('#c-sample').pressSequentially('35');
  await p.waitForFunction(() => document.querySelector('.preview-card')?.textContent.includes('۵٬۷۵۰٬۰۰۰'));
  await p.screenshot({ path: 'tests/screenshots/mobile-editor.png', fullPage: true });
  await p.getByRole('button', { name: 'ذخیره و انتشار' }).click();
  await p.waitForFunction(() => /فعال/.test(document.body.innerText) && !document.querySelector('#c-name'), null, { timeout: 5000 }).catch(() => {});
});
await t('campaign persists after reload', async () => {
  await p.reload(); await p.waitForSelector('.gate', { timeout: 9000 });
  await p.getByText('ورود به پنل مدیریت').click(); await p.goto(URL + '#/admin/campaigns'); await p.waitForSelector('.campaign-card');
  assert.match(await p.innerText('.campaign-card'), /کمپین آزمون/);
});
await t('add agent, assign, record sales, duplicate serial blocked', async () => {
  await p.goto(URL + '#/admin/agents'); await p.getByRole('button', { name: 'کارگزار جدید' }).click();
  await p.fill('#a-name', 'علی آزمون'); await p.fill('#a-code', 'AG-1'); await p.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await p.waitForSelector('.modal', { state: 'detached' });
  await p.getByRole('button', { name: /علی آزمون/ }).first().click();
  await p.getByLabel(/کمپین آزمون/).click(); await p.waitForFunction(() => [...document.querySelectorAll('.checks input')].some((i) => i.checked));
  await p.goto(URL + '#/admin/sales'); await p.waitForSelector('#s-agent');
  await p.selectOption('#s-agent', { index: 1 });
  for (const s of ['SN1', 'SN2', 'SN3']) { await p.fill('#s-serial', s); await p.getByRole('button', { name: 'ثبت فروش' }).click(); await p.waitForTimeout(250); }
  await p.fill('#s-serial', 'sn1'); await p.getByRole('button', { name: 'ثبت فروش' }).click();
  await p.waitForTimeout(300);
  assert.match(await p.innerText('body'), /قبلاً|تکراری/);
});
await t('approve sales → ticker shows real data in admin table', async () => {
  await p.goto(URL + '#/admin/sales');
  const approve = p.getByRole('button', { name: 'تأیید', exact: true });
  for (let i = 0; i < 3; i++) { const b = approve.first(); if (await b.count()) { await b.dispatchEvent('click'); await p.waitForTimeout(300); } }
  await p.goto(URL + '#/admin/agents'); await p.waitForSelector('.ticker-cell');
  assert.match(await p.innerText('.ticker-cell'), /[۰-۹]/);
});
let adminTicker = '';
await t('admin ticker and agent ticker share the same messages', async () => {
  await p.goto(URL + '#/admin/agents'); adminTicker = (await p.innerText('.ticker-cell')).trim();
  await p.getByRole('button', { name: /تغییر دسترسی/ }).first().click().catch(async () => { await p.goto(URL); });
  await p.goto(URL); await p.waitForSelector('.gate', { timeout: 9000 });
  await p.getByText('ورود به پنل کارگزار').click(); await p.getByText('علی آزمون').click();
  await p.waitForSelector('.ticker-static li', { state: 'attached' });
  const first = (await p.locator('.ticker-static li').first().textContent()).trim();
  assert.equal(first, adminTicker);
});
await t('agent view hides budget and other agents', async () => {
  const txt = await p.innerText('body');
  assert.ok(!/بودجه/.test(txt), 'budget visible');
  assert.equal(await p.locator('.answer').count(), 3);
  await p.screenshot({ path: 'tests/screenshots/mobile-agent.png', fullPage: true });
});
await t('reduced motion shows static ticker, no marquee', async () => {
  await p.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await p.locator('.ticker-window').isVisible(), false);
  assert.equal(await p.locator('.ticker-static').isVisible(), true);
  await p.emulateMedia({ reducedMotion: 'no-preference' });
});
await t('manifest, icons and service worker work under a subpath; offline shell loads', async () => {
  const m = await (await p.request.get(URL + 'manifest.webmanifest')).json();
  assert.equal(m.name, 'Techno Campgain'); assert.equal(m.dir, 'rtl'); assert.equal(m.start_url, './');
  for (const i of m.icons) assert.equal((await p.request.get(URL + i.src)).status(), 200);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForTimeout(500);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('.splash, .gate', { timeout: 8000 });
  await ctx.setOffline(false);
});
await t('desktop admin screenshot', async () => {
  await p.setViewportSize({ width: 1366, height: 860 });
  await p.goto(URL); await p.reload(); await p.waitForSelector('.gate', { timeout: 9000 }); await p.getByText('ورود به پنل مدیریت').click(); await p.goto(URL + '#/admin/dashboard'); await p.waitForTimeout(600);
  await p.screenshot({ path: 'tests/screenshots/desktop-dashboard.png' });
});
await t('no console errors during the run', async () => {
  const real = errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  assert.deepEqual(real, []);
});
await browser.close(); srv.kill();
console.log(failed ? `\n${failed} FAILED` : '\nall e2e passed'); process.exit(failed ? 1 : 0);
