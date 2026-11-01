import { useState } from 'react';
import { campaignTotals, PAYMENT_STATUS_LABEL } from '../../domain/ledger';
import { formatDate, formatDateLatin, formatInt, formatToman, rawInt } from '../../domain/numbers';
import { toCsv } from '../../domain/csv';
import { downloadText, stamp } from '../download';
import { EmptyState, Kpi, LevelBadge, PageHead, StatusPill, SALE_STATUS_LABEL } from '../widgets';
import { Icon } from '../icons';
import { CampaignSelect, useAdmin, useCampaignStats } from './context';

const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const dayJ = (ts: number) => formatDateLatin(day(ts));

export function Reports() {
  const { data, campaign, go } = useAdmin();
  const stats = useCampaignStats();
  const [tab, setTab] = useState<'perf' | 'audit'>('perf');
  const [q, setQ] = useState('');

  if (!campaign || !stats) {
    return (
      <>
        <PageHead title="گزارش‌ها" />
        <EmptyState title="گزارشی برای نمایش وجود ندارد" action={<button className="btn btn-primary" onClick={() => go('campaigns', 'new')}>طراحی کمپین</button>}>
          پس از ثبت کمپین و فروش، گزارش عملکرد و خروجی CSV اینجا ساخته می‌شود.
        </EmptyState>
      </>
    );
  }
  const t = campaignTotals(data, campaign);
  const rows = data.agents.filter((a) => stats.has(a.id) && a.campaignIds.includes(campaign.id)).map((a) => ({ a, s: stats.get(a.id)! }));
  const agentName = (id: string) => data.agents.find((a) => a.id === id)?.name ?? '';
  const agentCode = (id: string) => data.agents.find((a) => a.id === id)?.code ?? '';

  const exportAgents = () =>
    downloadText(
      `agents-${campaign.code}-${stamp()}.csv`,
      toCsv([
        ['شناسه کارگزار', 'نام', 'فروش معتبر', 'در انتظار تأیید', 'ردشده', 'سطح فعلی', 'دستگاه باقی‌مانده تا تکمیل بازه', 'پاداش بازه جاری (تومان)', 'پاداش تکمیل‌شده (تومان)', 'پاداش در حال تکمیل (تومان)', 'پرداخت‌شده (تومان)', 'پرداخت‌نشده (تومان)', 'وضعیت پرداخت', 'خط جاری فروش'],
        ...rows.map(({ a, s }) => [a.code, a.name, s.approved, s.pending, s.rejected, s.levelName ?? '', s.progress?.remainingToBlock ?? '', rawInt(s.progress?.blockReward), s.payable, s.accruing, s.paid, s.unpaid, PAYMENT_STATUS_LABEL[s.paymentStatus], s.messages[0]?.text ?? '']),
      ]),
    );
  const exportSales = () =>
    downloadText(
      `sales-${campaign.code}-${stamp()}.csv`,
      toCsv([
        ['شناسه فروش', 'تاریخ فروش (شمسی)', 'شناسه کارگزار', 'کارگزار', 'سریال دستگاه', 'پذیرنده', 'محصول', 'وضعیت', 'نسخه موتور محاسبه'],
        ...data.sales.filter((s) => s.campaignId === campaign.id).map((s) => [s.id, formatDateLatin(s.saleDate), agentCode(s.agentId), agentName(s.agentId), s.serial, s.merchant, s.product, SALE_STATUS_LABEL[s.status], s.engineVersion ?? '']),
      ]),
    );
  const exportPayouts = () =>
    downloadText(
      `payouts-${campaign.code}-${stamp()}.csv`,
      toCsv([
        ['شناسه پرداخت', 'تاریخ (شمسی)', 'شناسه کارگزار', 'کارگزار', 'مبلغ (تومان)', 'نسخه موتور محاسبه'],
        ...data.payouts.filter((p) => p.campaignId === campaign.id).map((p) => [p.id, dayJ(p.createdAt), agentCode(p.agentId), agentName(p.agentId), p.amount, p.engineVersion]),
      ]),
    );

  const audit = data.audit.slice().reverse().filter((e) => !q.trim() || e.summary.includes(q.trim()) || e.action.includes(q.trim()));

  return (
    <>
      <PageHead
        title="گزارش‌ها"
        sub="عملکرد کارگزاران، خروجی CSV و سوابق تغییرات"
        actions={
          <>
            <CampaignSelect />
          </>
        }
      />
      <section className="kpis">
        <Kpi label="فروش معتبر" value={formatInt(t.approved)} sub={`${formatInt(t.agentsWithSales)} کارگزار دارای فروش`} />
        <Kpi label="در انتظار تأیید" value={formatInt(t.pending)} sub={`${formatInt(t.rejected)} ردشده`} />
        <Kpi label="پاداش تعهدشده" value={formatToman(t.committed)} sub={`در حال تکمیل: ${formatToman(t.accruing)}`} />
        <Kpi label="پاداش پرداخت‌شده" value={formatToman(t.paid)} sub={`پرداخت‌نشده: ${formatToman(t.unpaid)}`} />
      </section>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'perf'} className={tab === 'perf' ? 'on' : ''} onClick={() => setTab('perf')}>
          عملکرد کارگزاران
        </button>
        <button role="tab" aria-selected={tab === 'audit'} className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>
          سوابق تغییرات
        </button>
      </div>

      {tab === 'perf' ? (
        <section className="card">
          <div className="card-title-row">
            <h2>جزئیات عملکرد</h2>
            <div className="btn-group">
              <button className="btn btn-light btn-sm" onClick={exportAgents}>
                <Icon name="download" size={16} /> CSV کارگزاران
              </button>
              <button className="btn btn-light btn-sm" onClick={exportSales}>
                <Icon name="download" size={16} /> CSV فروش‌ها
              </button>
              <button className="btn btn-light btn-sm" onClick={exportPayouts}>
                <Icon name="download" size={16} /> CSV پرداخت‌ها
              </button>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="muted">کارگزاری به این کمپین اختصاص داده نشده است.</p>
          ) : (
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>کارگزار</th>
                    <th>فروش معتبر</th>
                    <th>سطح</th>
                    <th>پاداش تکمیل‌شده</th>
                    <th>پرداخت‌شده</th>
                    <th>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ a, s }) => (
                    <tr key={a.id}>
                      <td data-label="کارگزار">
                        <button className="link" onClick={() => go('agents', a.id)}>
                          {a.name}
                        </button>
                      </td>
                      <td data-label="فروش معتبر">{formatInt(s.approved)}</td>
                      <td data-label="سطح">
                        <LevelBadge name={s.levelName} index={s.levelIndex} />
                      </td>
                      <td data-label="پاداش تکمیل‌شده">{formatToman(s.payable)}</td>
                      <td data-label="پرداخت‌شده">{formatToman(s.paid)}</td>
                      <td data-label="وضعیت">
                        <StatusPill kind={s.paymentStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="card">
          <div className="filters">
            <input aria-label="جستجو در سوابق" placeholder="جستجو در سوابق" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {audit.length === 0 ? (
            <p className="muted">رویدادی ثبت نشده است.</p>
          ) : (
            <ul className="rows">
              {audit.slice(0, 80).map((e) => (
                <li key={e.id} className="row-plain">
                  <span>
                    <strong>{e.action}</strong> — {e.summary}
                  </span>
                  <span className="muted small">{formatDate(day(e.at))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
