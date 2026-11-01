import { useState } from 'react';
import type { Agent } from '../../domain/types';
import { formatDate, formatInt, formatToman } from '../../domain/numbers';
import type { AgentCampaignStats } from '../../domain/ledger';
import { PAYMENT_STATUS_LABEL } from '../../domain/ledger';
import { useCore, Modal } from '../core';
import { EmptyState, Field, Kpi, Ladder, LevelBadge, PageHead, ProgressBar, SALE_STATUS_LABEL, StatusPill, Ticker, tierClass } from '../widgets';
import { Icon } from '../icons';
import { CampaignSelect, useAdmin, useCampaignStats } from './context';
import { PayButton } from './Payments';

export function Agents() {
  const { path } = useAdmin();
  return path[1] ? <AgentDetail agentId={path[1]} /> : <AgentList />;
}

/* ------------------------------------------------------------------ */

function AgentForm({ agent, onClose }: { agent?: Agent; onClose: () => void }) {
  const { exec } = useCore();
  const [f, setF] = useState({ name: agent?.name ?? '', code: agent?.code ?? '', phone: agent?.phone ?? '', group: agent?.group ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  async function submit() {
    setBusy(true);
    const r = await exec({ type: 'saveAgent', agent: { id: agent?.id, ...f } }, agent ? 'مشخصات کارگزار ذخیره شد.' : 'کارگزار ثبت شد.');
    setBusy(false);
    if (r.ok) return onClose();
    const map: Record<string, string> = {};
    for (const i of r.error.issues ?? []) map[i.field] = i.message;
    setErrors(map);
  }
  return (
    <Modal
      title={agent ? 'ویرایش کارگزار' : 'ثبت کارگزار جدید'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            انصراف
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            ذخیره
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="نام و نام خانوادگی" htmlFor="a-name" error={errors.name}>
          <input id="a-name" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="شناسه‌ی کارگزار" htmlFor="a-code" error={errors.code} hint="کد یکتا؛ مثلاً AG-014">
          <input id="a-code" dir="ltr" className="mono" value={f.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field label="شماره‌ی تماس" htmlFor="a-phone" error={errors.phone}>
          <input id="a-phone" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="گروه" htmlFor="a-group">
          <input id="a-group" value={f.group} onChange={(e) => set('group', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

type SortKey = 'sales' | 'remaining' | 'name';

function AgentList() {
  const { data, campaign, go } = useAdmin();
  const stats = useCampaignStats();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('all');
  const [pay, setPay] = useState('all');
  const [scope, setScope] = useState<'campaign' | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('sales');

  const list = data.agents
    .filter((a) => (scope === 'all' || !campaign ? true : a.campaignIds.includes(campaign.id)))
    .filter((a) => !q.trim() || a.name.includes(q.trim()) || a.code.toLowerCase().includes(q.trim().toLowerCase()))
    .map((a) => ({ a, s: stats?.get(a.id) ?? null }))
    .filter(({ s }) => {
      if (level !== 'all' && (!s || String(s.levelIndex) !== level)) return false;
      if (pay !== 'all' && (!s || s.paymentStatus !== pay)) return false;
      return true;
    })
    .sort((x, y) => {
      if (sort === 'name') return x.a.name.localeCompare(y.a.name, 'fa');
      if (sort === 'remaining') {
        const rx = x.s?.progress?.remainingToBlock ?? Infinity;
        const ry = y.s?.progress?.remainingToBlock ?? Infinity;
        return rx - ry;
      }
      return (y.s?.approved ?? 0) - (x.s?.approved ?? 0);
    });

  return (
    <>
      <PageHead
        title="کارگزاران"
        sub="سطح، پیشرفت و خط جاری فروش هر کارگزار در کمپین انتخاب‌شده"
        actions={
          <>
            <CampaignSelect />
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} /> کارگزار جدید
            </button>
          </>
        }
      />
      {adding && <AgentForm onClose={() => setAdding(false)} />}

      {data.agents.length === 0 ? (
        <EmptyState title="هنوز کارگزاری ثبت نشده است" action={<button className="btn btn-primary" onClick={() => setAdding(true)}>ثبت اولین کارگزار</button>}>
          پس از ثبت کارگزار، او را به کمپین اختصاص دهید تا فروش‌هایش ثبت و پیگیری شود.
        </EmptyState>
      ) : (
        <>
          <div className="filters">
            <div className="search">
              <Icon name="search" size={18} />
              <input aria-label="جستجوی کارگزار" placeholder="جستجوی نام یا شناسه" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select aria-label="نمایش" value={scope} onChange={(e) => setScope(e.target.value as 'campaign' | 'all')}>
              <option value="campaign">اختصاص‌یافته به این کمپین</option>
              <option value="all">همه‌ی کارگزاران</option>
            </select>
            <select aria-label="فیلتر سطح" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="all">همه‌ی سطح‌ها</option>
              <option value="-1">بدون سطح</option>
              {campaign?.tiers.map((t, i) => (
                <option key={t.id} value={String(i)}>
                  {t.name}
                </option>
              ))}
            </select>
            <select aria-label="فیلتر وضعیت پاداش" value={pay} onChange={(e) => setPay(e.target.value)}>
              <option value="all">همه‌ی وضعیت‌های پرداخت</option>
              {(['none', 'unpaid', 'partial', 'paid', 'overpaid'] as const).map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_STATUS_LABEL[k]}
                </option>
              ))}
            </select>
            <select aria-label="مرتب‌سازی" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="sales">بیشترین فروش</option>
              <option value="remaining">کمترین فاصله تا حدنصاب</option>
              <option value="name">نام</option>
            </select>
          </div>

          {list.length === 0 ? (
            <EmptyState title="کارگزاری با این فیلترها پیدا نشد" />
          ) : (
            <div className="table-wrap card">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>نام کارگزار</th>
                    <th>فروش معتبر</th>
                    <th>سطح فعلی</th>
                    <th>پیشرفت تا حدنصاب بعدی</th>
                    <th>دستگاه باقی‌مانده</th>
                    <th>پاداش بازه‌ی جاری</th>
                    <th>پاداش تکمیل‌شده</th>
                    <th>وضعیت پرداخت</th>
                    <th>خط جاری فروش</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(({ a, s }) => (
                    <tr key={a.id} className={a.active ? '' : 'is-off'}>
                      <td data-label="نام کارگزار">
                        <button className="link strong" onClick={() => go('agents', a.id)}>
                          {a.name}
                        </button>
                        <span className="muted small mono block">{a.code}{a.active ? '' : ' · غیرفعال'}</span>
                      </td>
                      <td data-label="فروش معتبر">{s ? formatInt(s.approved) : '—'}</td>
                      <td data-label="سطح فعلی">{s ? <LevelBadge name={s.levelName} index={s.levelIndex} /> : '—'}</td>
                      <td data-label="پیشرفت">{s && s.calculable ? <ProgressBar percent={s.blockPercent} /> : '—'}</td>
                      <td data-label="باقی‌مانده">{s?.progress?.remainingToBlock != null ? formatInt(s.progress.remainingToBlock) : s?.progress ? 'بدون سقف' : '—'}</td>
                      <td data-label="پاداش بازه‌ی جاری">{s?.progress?.blockReward != null ? formatToman(s.progress.blockReward) : '—'}</td>
                      <td data-label="پاداش تکمیل‌شده">{s ? formatToman(s.payable) : '—'}</td>
                      <td data-label="وضعیت پرداخت">{s ? <StatusPill kind={s.paymentStatus} /> : '—'}</td>
                      <td data-label="خط جاری" className="ticker-cell">{s && s.messages.length ? s.messages[0].text : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function AgentDetail({ agentId }: { agentId: string }) {
  const { data, campaign, go } = useAdmin();
  const stats = useCampaignStats();
  const { exec } = useCore();
  const [editing, setEditing] = useState(false);
  const agent = data.agents.find((a) => a.id === agentId);
  if (!agent) {
    return (
      <>
        <PageHead title="کارگزار" />
        <EmptyState title="این کارگزار پیدا نشد" action={<button className="btn btn-primary" onClick={() => go('agents')}>بازگشت</button>} />
      </>
    );
  }
  const s: AgentCampaignStats | null = campaign && stats ? (stats.get(agent.id) ?? null) : null;
  const assignedHere = !!campaign && agent.campaignIds.includes(campaign.id);
  const sales = campaign ? data.sales.filter((x) => x.agentId === agent.id && x.campaignId === campaign.id).slice().reverse() : [];
  const payouts = campaign ? data.payouts.filter((p) => p.agentId === agent.id && p.campaignId === campaign.id).slice().reverse() : [];
  const ownIds = new Set([agent.id, ...data.sales.filter((x) => x.agentId === agent.id).map((x) => x.id), ...data.payouts.filter((p) => p.agentId === agent.id).map((p) => p.id)]);
  const history = data.audit.filter((e) => ownIds.has(e.entityId)).slice(-12).reverse();
  const ranges = campaign ? campaign.tiers.map((t, i) => ({ name: t.name, end: t.endQty, rate: t.rate, start: i === 0 ? 1 : (campaign.tiers[i - 1].endQty ?? 0) + 1 })) : [];

  return (
    <>
      <PageHead
        title={agent.name}
        sub={
          <span className="mono">
            {agent.code}
            {agent.group ? ` · ${agent.group}` : ''}
            {agent.phone ? ` · ${agent.phone}` : ''}
          </span>
        }
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => go('agents')}>
              بازگشت
            </button>
            <button className="btn btn-light" onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} /> ویرایش
            </button>
            <button className="btn btn-light" onClick={() => exec({ type: 'setAgentActive', agentId: agent.id, active: !agent.active }, agent.active ? 'کارگزار غیرفعال شد.' : 'کارگزار فعال شد.')}>
              {agent.active ? 'غیرفعال‌کردن' : 'فعال‌کردن'}
            </button>
          </>
        }
      />
      {editing && <AgentForm agent={agent} onClose={() => setEditing(false)} />}

      <section className="card">
        <h2>کمپین‌های کارگزار</h2>
        {data.campaigns.length === 0 ? (
          <p className="muted">هنوز کمپینی ثبت نشده است.</p>
        ) : (
          <ul className="checks">
            {data.campaigns.map((c) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={agent.campaignIds.includes(c.id)}
                    onChange={(e) => exec({ type: 'assignAgent', agentId: agent.id, campaignId: c.id, assigned: e.target.checked })}
                  />
                  <span>{c.name}</span>
                  <StatusPill kind={c.status} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {campaign && assignedHere && s ? (
        <>
          <div className="page-sub-head">
            <h2>در کمپین «{campaign.name}»</h2>
            <CampaignSelect id="agent-campaign" />
          </div>
          <Ticker messages={s.messages} empty="برای نمایش خط جاری فروش، سطح‌ها و نرخ‌های کمپین باید کامل باشند." />
          <section className="kpis">
            <Kpi label="فروش معتبر" value={formatInt(s.approved)} sub={`${formatInt(s.pending)} در انتظار · ${formatInt(s.rejected)} ردشده`} />
            <Kpi label="سطح فعلی" value={<LevelBadge name={s.levelName} index={s.levelIndex} />} />
            <Kpi label="باقی‌مانده تا تکمیل بازه" value={s.progress?.remainingToBlock != null ? formatInt(s.progress.remainingToBlock) : 'بدون سقف'} sub={s.progress?.blockReward != null ? `پاداش بازه: ${formatToman(s.progress.blockReward)}` : undefined} />
            <Kpi label="پاداش تکمیل‌شده" value={formatToman(s.payable)} sub={`در حال تکمیل: ${formatToman(s.accruing)}`} />
            <Kpi label="پرداخت‌شده" value={formatToman(s.paid)} sub={<StatusPill kind={s.paymentStatus} />} tone={s.overpaid > 0 ? 'warn' : undefined} />
          </section>

          {s.calculable && s.breakdown && s.progress ? (
            <div className="grid-2">
              <section className="card">
                <h2>پلکان</h2>
                <Ladder tiers={ranges} validSales={s.approved} levelIndex={s.progress.levelIndex} blockIndex={s.progress.blockIndex} />
              </section>
              <section className="card">
                <h2>محاسبه‌ی پاداش</h2>
                <div className="table-wrap">
                  <table className="data mini">
                    <thead>
                      <tr>
                        <th>سطح</th>
                        <th>دستگاه</th>
                        <th>نرخ</th>
                        <th>پاداش</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.breakdown.rows.map((r) => (
                        <tr key={r.index}>
                          <td>
                            <span className={`dot ${tierClass(r.index)}`} /> {r.name}
                          </td>
                          <td>{formatInt(r.count)}</td>
                          <td>{formatInt(r.rate)}</td>
                          <td>{formatToman(r.reward)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>مجموع</td>
                        <td>{formatToman(s.totalReward)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="pay-row">
                  <PayButton campaign={campaign} agent={agent} stats={s} />
                  {s.unpaid > 0 && <span className="muted small">پرداخت‌نشده: {formatToman(s.unpaid)}</span>}
                </div>
              </section>
            </div>
          ) : (
            <p className="note">
              <Icon name="info" size={16} /> سطح‌ها و نرخ‌های این کمپین کامل نیست؛ محاسبه‌ی پاداش پس از تکمیل آن‌ها انجام می‌شود.
            </p>
          )}

          <section className="card">
            <h2>فروش‌های ثبت‌شده</h2>
            {sales.length === 0 ? (
              <p className="muted">برای این کارگزار فروشی ثبت نشده است.</p>
            ) : (
              <div className="table-wrap">
                <table className="data responsive">
                  <thead>
                    <tr>
                      <th>تاریخ</th>
                      <th>سریال دستگاه</th>
                      <th>پذیرنده</th>
                      <th>وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.slice(0, 30).map((x) => (
                      <tr key={x.id}>
                        <td data-label="تاریخ">{formatDate(x.saleDate)}</td>
                        <td data-label="سریال" className="mono">{x.serial}</td>
                        <td data-label="پذیرنده">{x.merchant || '—'}</td>
                        <td data-label="وضعیت">
                          <StatusPill kind={x.status}>{SALE_STATUS_LABEL[x.status]}</StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sales.length > 30 && <p className="muted small">{formatInt(sales.length - 30)} فروش قدیمی‌تر در صفحه‌ی «فروش» و خروجی CSV موجود است.</p>}
              </div>
            )}
          </section>

          {payouts.length > 0 && (
            <section className="card">
              <h2>پرداخت‌ها</h2>
              <ul className="rows">
                {payouts.map((p) => (
                  <li key={p.id} className="row-plain">
                    <span>{formatDate(new Date(p.createdAt).toISOString().slice(0, 10))}</span>
                    <strong>{formatToman(p.amount)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section className="card">
          <p className="muted">
            {campaign ? `«${agent.name}» به کمپین «${campaign.name}» اختصاص داده نشده است. از فهرست بالا او را اضافه کنید.` : 'ابتدا یک کمپین بسازید.'}
          </p>
        </section>
      )}

      <section className="card">
        <h2>تاریخچه‌ی تغییرات</h2>
        {history.length === 0 ? (
          <p className="muted">رویدادی ثبت نشده است.</p>
        ) : (
          <ul className="rows">
            {history.map((e) => (
              <li key={e.id} className="row-plain">
                <span>{e.summary}</span>
                <span className="muted small">{formatDate(new Date(e.at).toISOString().slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
