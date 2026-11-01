import { useState } from 'react';
import type { SaleStatus } from '../../domain/types';
import { formatDate, formatInt, normalizeSerial, todayIso } from '../../domain/numbers';
import { useCore } from '../core';
import { EmptyState, Field, JalaliDateField, PageHead, SALE_STATUS_LABEL, StatusPill } from '../widgets';
import { Icon } from '../icons';
import { CampaignSelect, useAdmin } from './context';

export function Sales() {
  const { data, campaign, go } = useAdmin();
  const { exec } = useCore();
  const [agentId, setAgentId] = useState('');
  const [serial, setSerial] = useState('');
  const [merchant, setMerchant] = useState('');
  const [product, setProduct] = useState('');
  const [saleDate, setSaleDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [serialError, setSerialError] = useState('');
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState<'all' | SaleStatus>('all');
  const [filterAgent, setFilterAgent] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);

  if (!campaign) {
    return (
      <>
        <PageHead title="فروش" />
        <EmptyState title="ابتدا یک کمپین بسازید" action={<button className="btn btn-primary" onClick={() => go('campaigns', 'new')}>طراحی کمپین</button>} />
      </>
    );
  }

  const agents = data.agents.filter((a) => a.active && a.campaignIds.includes(campaign.id));
  const sales = data.sales.filter((s) => s.campaignId === campaign.id);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  sales.forEach((s) => (counts[s.status] += 1));
  const name = (id: string) => data.agents.find((a) => a.id === id)?.name ?? '—';
  const productOptions = campaign.products.split(/[,،]/).map((p) => p.trim()).filter(Boolean);

  const needle = normalizeSerial(q);
  const shown = sales
    .filter((s) => (status === 'all' ? true : s.status === status))
    .filter((s) => (filterAgent === 'all' ? true : s.agentId === filterAgent))
    .filter((s) => !needle || s.serial.includes(needle))
    .slice()
    .reverse();

  async function submit() {
    setSerialError('');
    if (!agentId) return void setSerialError('کارگزار را انتخاب کنید.');
    setBusy(true);
    const r = await exec({ type: 'submitSale', sale: { campaignId: campaign!.id, agentId, serial, merchant, product, saleDate, note } }, 'فروش ثبت شد و در انتظار تأیید است.');
    setBusy(false);
    if (r.ok) {
      setSerial('');
      setMerchant('');
      setNote('');
      (document.getElementById('s-serial') as HTMLInputElement | null)?.focus();
    } else {
      setSerialError(r.error.message);
    }
  }

  async function review(id: string, version: number, decision: 'approve' | 'reject') {
    const r = await exec({ type: 'reviewSale', saleId: id, decision, expectedVersion: version }, decision === 'approve' ? 'فروش تأیید شد.' : 'فروش رد شد.');
    if (!r.ok) window.dispatchEvent(new Event('tc:changed')); // show the fresh state after a conflict
  }

  return (
    <>
      <PageHead title="فروش" sub="ثبت، تأیید و رد فروش دستگاه‌ها. فقط فروش تأییدشده در سطح و پاداش حساب می‌شود." actions={<CampaignSelect />} />

      <section className="chips-row" aria-label="خلاصه‌ی وضعیت فروش‌ها">
        <span className="chip chip-warn">{formatInt(counts.pending)} در انتظار تأیید</span>
        <span className="chip chip-ok">{formatInt(counts.approved)} تأییدشده</span>
        <span className="chip">{formatInt(counts.rejected)} ردشده</span>
      </section>

      <section className="card form-card">
        <h2>ثبت فروش جدید</h2>
        {campaign.status !== 'active' ? (
          <p className="note">
            <Icon name="info" size={16} /> برای ثبت فروش، کمپین باید فعال باشد. وضعیت فعلی: {campaign.status === 'draft' ? 'پیش‌نویس' : campaign.status === 'paused' ? 'متوقف' : 'پایان‌یافته'}.
          </p>
        ) : agents.length === 0 ? (
          <p className="note">
            <Icon name="info" size={16} /> کارگزار فعالی به این کمپین اختصاص داده نشده است.{' '}
            <button className="link" onClick={() => go('agents')}>
              رفتن به کارگزاران
            </button>
          </p>
        ) : (
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="کارگزار" htmlFor="s-agent">
              <select id="s-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">انتخاب کنید</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="شماره‌ی سریال دستگاه" htmlFor="s-serial" error={serialError || undefined} hint="هر سریال در یک کمپین فقط یک بار پذیرفته می‌شود.">
              <input id="s-serial" dir="ltr" className="mono" value={serial} onChange={(e) => (setSerial(e.target.value), setSerialError(''))} autoComplete="off" />
            </Field>
            <Field label="تاریخ فروش" htmlFor="s-date">
              <JalaliDateField id="s-date" label="تاریخ فروش" value={saleDate} onChange={setSaleDate} />
            </Field>
            <Field label="محصول" htmlFor="s-product">
              <input id="s-product" list="s-products" value={product} onChange={(e) => setProduct(e.target.value)} />
              <datalist id="s-products">
                {productOptions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field label="نام پذیرنده" htmlFor="s-merchant">
              <input id="s-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
            </Field>
            <Field label="یادداشت" htmlFor="s-note">
              <input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="span-2 form-actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                <Icon name="plus" size={18} /> ثبت فروش
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="card">
        <h2>دفتر فروش</h2>
        <div className="filters">
          <div className="search">
            <Icon name="search" size={18} />
            <input aria-label="جستجوی سریال" dir="ltr" placeholder="جستجوی سریال" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select aria-label="فیلتر وضعیت" value={status} onChange={(e) => (setStatus(e.target.value as 'all' | SaleStatus), setLimit(40))}>
            <option value="all">همه‌ی وضعیت‌ها</option>
            <option value="pending">در انتظار تأیید</option>
            <option value="approved">تأییدشده</option>
            <option value="rejected">ردشده</option>
          </select>
          <select aria-label="فیلتر کارگزار" value={filterAgent} onChange={(e) => (setFilterAgent(e.target.value), setLimit(40))}>
            <option value="all">همه‌ی کارگزاران</option>
            {data.agents.filter((a) => a.campaignIds.includes(campaign.id)).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {shown.length === 0 ? (
          <p className="muted">{sales.length === 0 ? 'هنوز فروشی ثبت نشده است.' : 'فروشی با این فیلترها پیدا نشد.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="data responsive">
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>کارگزار</th>
                  <th>سریال</th>
                  <th>پذیرنده</th>
                  <th>محصول</th>
                  <th>وضعیت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((s) => (
                  <tr key={s.id}>
                    <td data-label="تاریخ">{formatDate(s.saleDate)}</td>
                    <td data-label="کارگزار">{name(s.agentId)}</td>
                    <td data-label="سریال" className="mono">{s.serial}</td>
                    <td data-label="پذیرنده">{s.merchant || '—'}</td>
                    <td data-label="محصول">{s.product || '—'}</td>
                    <td data-label="وضعیت">
                      <StatusPill kind={s.status}>{SALE_STATUS_LABEL[s.status]}</StatusPill>
                    </td>
                    <td className="cell-actions">
                      {s.status !== 'approved' && (
                        <button className="btn btn-sm btn-primary" onClick={() => review(s.id, s.version, 'approve')}>
                          <Icon name="check" size={16} /> تأیید
                        </button>
                      )}
                      {s.status !== 'rejected' && (
                        <button className="btn btn-sm btn-danger-ghost" onClick={() => review(s.id, s.version, 'reject')}>
                          <Icon name="x" size={16} /> رد
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > limit && (
              <div className="more-row">
                <button className="btn btn-light" onClick={() => setLimit((l) => l + 40)}>
                  نمایش {formatInt(Math.min(40, shown.length - limit))} مورد بیشتر
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
