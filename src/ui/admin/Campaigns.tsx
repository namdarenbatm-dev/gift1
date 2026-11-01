import { useMemo, useState } from 'react';
import type { Campaign, CampaignInput, Issue, Tier } from '../../domain/types';
import { MAX_BUDGET, MAX_QTY, MAX_RATE, formatDate, formatInt, formatToman, parseIntegerInput } from '../../domain/numbers';
import { rewardBreakdown, validateCampaign, validateTiers } from '../../domain/engine';
import { buildTicker } from '../../domain/ticker';
import { campaignTotals } from '../../domain/ledger';
import { useCore } from '../core';
import { EmptyState, Field, JalaliDateField, NumberField, PageHead, StatusPill, numberFromTyped, toTyped } from '../widgets';
import { Icon } from '../icons';
import { useAdmin } from './context';

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export function Campaigns() {
  const { path } = useAdmin();
  if (path[1] === 'new') return <CampaignEditor key="new" />;
  if (path[1]) return <CampaignEditor key={path[1]} campaignId={path[1]} />;
  return <CampaignList />;
}

function CampaignList() {
  const { data, go } = useAdmin();
  return (
    <>
      <PageHead
        title="کمپین‌ها"
        sub="هر کمپین پلکان، بودجه و کارگزاران مستقل خود را دارد."
        actions={
          <button className="btn btn-primary" onClick={() => go('campaigns', 'new')}>
            <Icon name="plus" size={18} /> کمپین جدید
          </button>
        }
      />
      {data.campaigns.length === 0 ? (
        <EmptyState title="کمپینی ثبت نشده است" action={<button className="btn btn-primary" onClick={() => go('campaigns', 'new')}>طراحی اولین کمپین</button>}>
          نام، بازه‌ی زمانی، بودجه و پلکان پاداش را خودتان وارد می‌کنید؛ هیچ عددی از پیش پر نشده است.
        </EmptyState>
      ) : (
        <div className="cards">
          {[...data.campaigns].reverse().map((c) => {
            const t = campaignTotals(data, c);
            const agents = data.agents.filter((a) => a.campaignIds.includes(c.id)).length;
            return (
              <article className="card campaign-card" key={c.id}>
                <div className="card-top">
                  <StatusPill kind={c.status} />
                  <span className="mono muted small">{c.code}</span>
                </div>
                <h2>{c.name}</h2>
                <p className="muted small">
                  {c.startDate && c.endDate ? `${formatDate(c.startDate)} تا ${formatDate(c.endDate)}` : 'بازه‌ی زمانی تعیین نشده'}
                </p>
                <dl className="facts">
                  <div>
                    <dt>بودجه</dt>
                    <dd>{c.budget === null ? 'بدون سقف' : formatToman(c.budget)}</dd>
                  </div>
                  <div>
                    <dt>سطح‌ها</dt>
                    <dd>{formatInt(c.tiers.length)}</dd>
                  </div>
                  <div>
                    <dt>کارگزاران</dt>
                    <dd>{formatInt(agents)}</dd>
                  </div>
                  <div>
                    <dt>فروش معتبر</dt>
                    <dd>{formatInt(t.approved)}</dd>
                  </div>
                </dl>
                <button className="btn btn-light" onClick={() => go('campaigns', c.id)}>
                  {c.status === 'draft' ? 'ادامه‌ی طراحی' : 'مشاهده و ویرایش'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

interface TierRow {
  key: string;
  id?: string;
  name: string;
  endQty: string;
  rate: string;
}

interface FormState {
  id?: string;
  code: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  products: string;
  agentGroup: string;
  budget: string;
  tiers: TierRow[];
  validSaleRules: string;
  tierCompletionRules: string;
  payoutRules: string;
}

const SUGGESTED_NAMES = ['برنزی', 'نقره‌ای', 'طلایی', 'پلاتینیوم'];
let rowKey = 0;
const newKey = () => `row${++rowKey}`;

/** A new campaign starts with suggested level NAMES only. Every number field is empty. */
function blankForm(): FormState {
  return {
    code: '',
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    products: '',
    agentGroup: '',
    budget: '',
    tiers: SUGGESTED_NAMES.map((name) => ({ key: newKey(), name, endQty: '', rate: '' })),
    validSaleRules: '',
    tierCompletionRules: '',
    payoutRules: '',
  };
}

function formFrom(c: Campaign): FormState {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description,
    startDate: c.startDate,
    endDate: c.endDate,
    products: c.products,
    agentGroup: c.agentGroup,
    budget: toTyped(c.budget),
    tiers: c.tiers.map((t) => ({ key: newKey(), id: t.id, name: t.name, endQty: toTyped(t.endQty), rate: toTyped(t.rate) })),
    validSaleRules: c.validSaleRules,
    tierCompletionRules: c.tierCompletionRules,
    payoutRules: c.payoutRules,
  };
}

function toInput(f: FormState): { input: CampaignInput; issues: Issue[] } {
  const issues: Issue[] = [];
  const num = (text: string, field: string, max: number): number | null => {
    const p = parseIntegerInput(text, max);
    if (!p.ok) {
      issues.push({ field, message: p.message });
      return null;
    }
    return p.value;
  };
  const budget = num(f.budget, 'budget', MAX_BUDGET);
  const last = f.tiers.length - 1;
  const tiers = f.tiers.map((t, i) => ({
    id: t.id,
    name: t.name,
    endQty: i === last ? null : num(t.endQty, `tiers.${i}.endQty`, MAX_QTY),
    rate: num(t.rate, `tiers.${i}.rate`, MAX_RATE),
  }));
  return {
    input: {
      id: f.id,
      code: f.code,
      name: f.name,
      description: f.description,
      startDate: f.startDate,
      endDate: f.endDate,
      products: f.products,
      agentGroup: f.agentGroup,
      budget,
      tiers,
      validSaleRules: f.validSaleRules,
      tierCompletionRules: f.tierCompletionRules,
      payoutRules: f.payoutRules,
    },
    issues,
  };
}

function CampaignEditor({ campaignId }: { campaignId?: string }) {
  const { data, go } = useAdmin();
  const { exec, confirm } = useCore();
  const existing = campaignId ? (data.campaigns.find((c) => c.id === campaignId) ?? null) : null;
  const [form, setForm] = useState<FormState>(() => (existing ? formFrom(existing) : blankForm()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sample, setSample] = useState('');
  const [busy, setBusy] = useState(false);

  const locked = existing ? data.payouts.some((p) => p.campaignId === existing.id) : false;
  const isDraft = !existing || existing.status === 'draft';

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: '' }));
  };
  const setTier = (i: number, patch: Partial<TierRow>) => setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const live = useMemo(() => toInput(form), [form]);
  const liveTiers: Tier[] = live.input.tiers.map((t, i) => ({ id: t.id ?? `p${i}`, name: t.name, endQty: t.endQty, rate: t.rate }));
  const tierIssues = useMemo(() => validateTiers(liveTiers), [form]);
  const calculable = tierIssues.length === 0 && live.issues.length === 0;
  const sampleN = numberFromTyped(sample, MAX_QTY);
  const breakdown = calculable && sampleN !== null ? rewardBreakdown(liveTiers, sampleN) : null;
  const previewMessages = calculable && sampleN !== null ? buildTicker(liveTiers, sampleN) : [];

  if (campaignId && !existing) {
    return (
      <>
        <PageHead title="ویرایش کمپین" />
        <EmptyState title="این کمپین پیدا نشد" action={<button className="btn btn-primary" onClick={() => go('campaigns')}>بازگشت به کمپین‌ها</button>} />
      </>
    );
  }

  const errorOf = (field: string) => errors[field] || undefined;
  const moveTier = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= form.tiers.length) return;
    // Names and rates move; thresholds stay in place so the ladder keeps ascending.
    setForm((f) => {
      const t = f.tiers.map((x) => ({ ...x }));
      const swap = (key: 'name' | 'rate' | 'id') => {
        const tmp = t[i][key];
        t[i][key] = t[j][key] as never;
        t[j][key] = tmp as never;
      };
      swap('name');
      swap('rate');
      swap('id');
      return { ...f, tiers: t };
    });
  };
  const removeTier = (i: number) => {
    if (form.tiers.length <= 1) return;
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, j) => j !== i) }));
  };
  const addTier = () => setForm((f) => ({ ...f, tiers: [...f.tiers, { key: newKey(), name: '', endQty: '', rate: '' }] }));

  async function save(publish: boolean) {
    const { input, issues } = toInput(form);
    const mode = publish || !isDraft ? 'publish' : 'draft';
    const all = [...issues, ...validateCampaign(input, mode)];
    if (all.length) {
      const map: Record<string, string> = {};
      for (const i of all) if (!map[i.field]) map[i.field] = i.message;
      setErrors(map);
      window.requestAnimationFrame(() => (document.querySelector('.has-error input, .has-error textarea, .is-invalid input') as HTMLElement | null)?.focus());
      return;
    }
    setBusy(true);
    const r = await exec({ type: 'saveCampaign', campaign: input }, publish ? undefined : 'تغییرات ذخیره شد.');
    if (!r.ok) {
      const map: Record<string, string> = {};
      for (const i of r.error.issues ?? []) if (!map[i.field]) map[i.field] = i.message;
      setErrors(map);
      setBusy(false);
      return;
    }
    const id = String(r.data?.campaignId ?? existing?.id);
    if (publish) {
      const r2 = await exec({ type: 'setCampaignStatus', campaignId: id, status: 'active' }, 'کمپین منتشر شد و برای کارگزاران فعال است.');
      setBusy(false);
      if (r2.ok) go('campaigns');
      else go('campaigns', id);
      return;
    }
    setBusy(false);
    if (!existing) go('campaigns', id);
  }

  async function changeStatus(status: 'paused' | 'active' | 'ended') {
    if (!existing) return;
    if (status === 'ended') {
      const ok = await confirm({
        title: 'پایان کمپین',
        body: 'پس از پایان کمپین نمی‌توان فروش تازه ثبت کرد و کمپین دوباره فعال نمی‌شود. محاسبه و پرداخت پاداش‌ها ادامه دارد.',
        confirmLabel: 'پایان کمپین',
        danger: true,
      });
      if (!ok) return;
    }
    const label = { paused: 'کمپین متوقف شد.', active: 'کمپین دوباره فعال شد.', ended: 'کمپین پایان یافت.' }[status];
    await exec({ type: 'setCampaignStatus', campaignId: existing.id, status }, label);
  }

  const assigned = existing ? data.agents.filter((a) => a.campaignIds.includes(existing.id)) : [];

  return (
    <>
      <PageHead
        title={existing ? existing.name || 'ویرایش کمپین' : 'طراحی کمپین جدید'}
        sub={existing ? <StatusPill kind={existing.status} /> : 'هیچ عددی از پیش پر نشده است؛ همه‌ی مبالغ و حدنصاب‌ها را شما تعیین می‌کنید.'}
        actions={
          <button className="btn btn-ghost" onClick={() => go('campaigns')}>
            بازگشت
          </button>
        }
      />

      <div className="editor-grid">
        <div className="editor-main">
          <section className="card form-card">
            <h2>اطلاعات پایه</h2>
            <div className="form-grid">
              <Field label="نام کمپین" htmlFor="c-name" error={errorOf('name')}>
                <input id="c-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="شناسه‌ی کمپین" htmlFor="c-code" error={errorOf('code')} hint="یک کد کوتاه و یکتا برای ارجاع و گزارش‌ها.">
                <input id="c-code" dir="ltr" className="mono" value={form.code} onChange={(e) => set('code', e.target.value)} />
              </Field>
              <Field label="توضیحات" htmlFor="c-desc" className="span-2">
                <textarea id="c-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="card form-card">
            <h2>زمان‌بندی و بودجه</h2>
            <div className="form-grid">
              <Field label="تاریخ شروع" htmlFor="c-start" error={errorOf('startDate')}>
                <JalaliDateField id="c-start" label="تاریخ شروع" value={form.startDate} onChange={(v) => set('startDate', v)} invalid={!!errorOf('startDate')} />
              </Field>
              <Field label="تاریخ پایان" htmlFor="c-end" error={errorOf('endDate')}>
                <JalaliDateField id="c-end" label="تاریخ پایان" value={form.endDate} onChange={(v) => set('endDate', v)} invalid={!!errorOf('endDate')} />
              </Field>
              <Field label="بودجه‌ی کل کمپین" htmlFor="c-budget" error={errorOf('budget')} hint="اختیاری. اگر خالی بماند، کمپین سقف بودجه ندارد." className="span-2">
                <NumberField id="c-budget" value={form.budget} onChange={(v) => set('budget', v)} unit="تومان" invalid={!!errorOf('budget')} />
              </Field>
            </div>
          </section>

          <section className="card form-card">
            <h2>شمول کمپین</h2>
            <div className="form-grid">
              <Field label="محصولات مشمول" htmlFor="c-products" hint="مثلاً نام مدل‌های کارتخوان، با ویرگول جدا کنید.">
                <input id="c-products" value={form.products} onChange={(e) => set('products', e.target.value)} />
              </Field>
              <Field label="گروه کارگزاران مشمول" htmlFor="c-group">
                <input id="c-group" value={form.agentGroup} onChange={(e) => set('agentGroup', e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="card form-card">
            <div className="card-title-row">
              <h2>پلکان‌های فروش و پاداش</h2>
              <button className="btn btn-light btn-sm" onClick={addTier} disabled={locked}>
                <Icon name="plus" size={16} /> افزودن سطح
              </button>
            </div>
            {locked && (
              <p className="note">
                <Icon name="info" size={16} /> پس از ثبت پرداخت، سطح‌ها و نرخ‌ها قفل می‌شوند تا پاداش‌های پرداخت‌شده تغییر نکنند.
              </p>
            )}
            {errorOf('tiers') && <p className="error">{errorOf('tiers')}</p>}
            <div className="tier-table" role="group" aria-label="سطح‌های کمپین">
              <div className="tier-head" aria-hidden="true">
                <span>عنوان سطح</span>
                <span>از دستگاه</span>
                <span>تا دستگاه</span>
                <span>پاداش هر دستگاه</span>
                <span />
              </div>
              {form.tiers.map((t, i) => {
                const last = i === form.tiers.length - 1;
                const prev = i === 0 ? 0 : numberFromTyped(form.tiers[i - 1].endQty);
                return (
                  <div className="tier-row" key={t.key}>
                    <div className="cell" data-label="عنوان سطح">
                      <input aria-label={`عنوان سطح ${formatInt(i + 1)}`} value={t.name} disabled={locked} aria-invalid={!!errorOf(`tiers.${i}.name`) || undefined} onChange={(e) => setTier(i, { name: e.target.value })} />
                      {errorOf(`tiers.${i}.name`) && <p className="error">{errorOf(`tiers.${i}.name`)}</p>}
                    </div>
                    <div className="cell" data-label="از دستگاه">
                      <span className="static-num">{prev === null ? '—' : formatInt(prev + 1)}</span>
                    </div>
                    <div className="cell" data-label="تا دستگاه">
                      {last ? (
                        <span className="static-num muted">بدون سقف</span>
                      ) : (
                        <>
                          <NumberField label={`حدنصاب سطح ${formatInt(i + 1)}`} value={t.endQty} onChange={(v) => setTier(i, { endQty: v })} unit="دستگاه" disabled={locked} invalid={!!errorOf(`tiers.${i}.endQty`)} />
                          {errorOf(`tiers.${i}.endQty`) && <p className="error">{errorOf(`tiers.${i}.endQty`)}</p>}
                        </>
                      )}
                    </div>
                    <div className="cell" data-label="پاداش هر دستگاه">
                      <NumberField label={`نرخ پاداش سطح ${formatInt(i + 1)}`} value={t.rate} onChange={(v) => setTier(i, { rate: v })} unit="تومان" disabled={locked} invalid={!!errorOf(`tiers.${i}.rate`)} />
                      {errorOf(`tiers.${i}.rate`) && <p className="error">{errorOf(`tiers.${i}.rate`)}</p>}
                    </div>
                    <div className="cell cell-actions">
                      <button className="icon-btn" onClick={() => moveTier(i, -1)} disabled={locked || i === 0} aria-label="انتقال به بالا" title="جابه‌جایی عنوان و نرخ؛ حدنصاب‌ها در جای خود می‌مانند">
                        <Icon name="up" size={18} />
                      </button>
                      <button className="icon-btn" onClick={() => moveTier(i, 1)} disabled={locked || last} aria-label="انتقال به پایین" title="جابه‌جایی عنوان و نرخ؛ حدنصاب‌ها در جای خود می‌مانند">
                        <Icon name="down" size={18} />
                      </button>
                      <button className="icon-btn icon-danger" onClick={() => removeTier(i)} disabled={locked || form.tiers.length <= 1} aria-label={`حذف سطح ${formatInt(i + 1)}`}>
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="hint">آخرین سطح بدون سقف است و نرخ آن برای همه‌ی دستگاه‌های بعدی ادامه پیدا می‌کند. هر دستگاه فقط یک بار و در بازه‌ی خودش حساب می‌شود.</p>
          </section>

          <section className="card form-card">
            <h2>قواعد کمپین</h2>
            <div className="form-grid">
              <Field label="شرایط فروش معتبر" htmlFor="c-r1" className="span-2">
                <textarea id="c-r1" rows={2} value={form.validSaleRules} onChange={(e) => set('validSaleRules', e.target.value)} />
              </Field>
              <Field label="قواعد تکمیل سطح" htmlFor="c-r2">
                <textarea id="c-r2" rows={2} value={form.tierCompletionRules} onChange={(e) => set('tierCompletionRules', e.target.value)} />
              </Field>
              <Field label="شرایط تأیید و پرداخت پاداش" htmlFor="c-r3">
                <textarea id="c-r3" rows={2} value={form.payoutRules} onChange={(e) => set('payoutRules', e.target.value)} />
              </Field>
            </div>
          </section>

          {existing && (
            <section className="card form-card">
              <h2>کارگزاران این کمپین</h2>
              {assigned.length ? (
                <p>{assigned.map((a) => a.name).join('، ')}</p>
              ) : (
                <p className="muted">کارگزاری اختصاص داده نشده است. از بخش «کارگزاران» افراد را به این کمپین اضافه کنید.</p>
              )}
            </section>
          )}
        </div>

        <aside className="editor-side">
          <section className="card preview-card">
            <h2>پیش‌نمایش مالی</h2>
            <Field label="تعداد فروش فرضی" htmlFor="c-sample" hint="برای دیدن مجموع پاداش، تعداد فروش را وارد کنید.">
              <NumberField id="c-sample" value={sample} onChange={setSample} unit="دستگاه" />
            </Field>
            {!calculable ? (
              <p className="muted small">برای پیش‌نمایش، همه‌ی حدنصاب‌ها و نرخ‌ها را کامل کنید{tierIssues[0] ? `؛ ${tierIssues[0].message}` : '.'}</p>
            ) : breakdown ? (
              <>
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>سطح</th>
                      <th>دستگاه</th>
                      <th>پاداش</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.rows.map((r) => (
                      <tr key={r.index}>
                        <td>{r.name}</td>
                        <td>{formatInt(r.count)}</td>
                        <td>{formatToman(r.reward)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <dl className="sum">
                  <div>
                    <dt>مجموع پاداش</dt>
                    <dd>{formatToman(breakdown.totalReward)}</dd>
                  </div>
                  <div>
                    <dt>قابل پرداخت (بازه‌های تکمیل‌شده)</dt>
                    <dd>{formatToman(breakdown.payable)}</dd>
                  </div>
                  <div>
                    <dt>در حال تکمیل</dt>
                    <dd>{formatToman(breakdown.accruing)}</dd>
                  </div>
                  {live.input.budget !== null && (
                    <div className={breakdown.totalReward > live.input.budget ? 'bad' : ''}>
                      <dt>نسبت به بودجه</dt>
                      <dd>{breakdown.totalReward > live.input.budget ? `${formatToman(breakdown.totalReward - live.input.budget)} بیشتر` : `${formatToman(live.input.budget - breakdown.totalReward)} باقی‌مانده`}</dd>
                    </div>
                  )}
                </dl>
                {previewMessages.length > 0 && (
                  <div className="preview-msgs">
                    <h3>پیام‌های خط جاری فروش</h3>
                    <ul>
                      {previewMessages.map((m, i) => (
                        <li key={i}>{m.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="muted small">هنوز تعداد فروشی وارد نشده است.</p>
            )}
          </section>
        </aside>
      </div>

      <div className="action-bar">
        {isDraft ? (
          <>
            <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>
              ذخیره‌ی پیش‌نویس
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>
              ذخیره و انتشار
            </button>
          </>
        ) : (
          <>
            {existing!.status === 'active' && (
              <button className="btn btn-ghost" onClick={() => changeStatus('paused')}>
                <Icon name="pause" size={16} /> توقف
              </button>
            )}
            {existing!.status === 'paused' && (
              <button className="btn btn-ghost" onClick={() => changeStatus('active')}>
                <Icon name="play" size={16} /> فعال‌سازی دوباره
              </button>
            )}
            {existing!.status !== 'ended' && (
              <button className="btn btn-danger-ghost" onClick={() => changeStatus('ended')}>
                پایان کمپین
              </button>
            )}
            <button className="btn btn-primary" disabled={busy} onClick={() => save(false)}>
              ذخیره‌ی تغییرات
            </button>
          </>
        )}
      </div>
    </>
  );
}
