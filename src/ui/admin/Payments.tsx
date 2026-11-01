import type { Agent, Campaign } from '../../domain/types';
import { formatDate, formatInt, formatToman } from '../../domain/numbers';
import { campaignTotals } from '../../domain/ledger';
import type { AgentCampaignStats } from '../../domain/ledger';
import { useCore } from '../core';
import { EmptyState, Kpi, PageHead, StatusPill } from '../widgets';
import { CampaignSelect, useAdmin, useCampaignStats } from './context';

export function PayButton({ campaign, agent, stats, small }: { campaign: Campaign; agent: Agent; stats: AgentCampaignStats; small?: boolean }) {
  const { exec, confirm } = useCore();
  if (stats.unpaid <= 0) return null;
  return (
    <button
      className={`btn btn-primary${small ? ' btn-sm' : ''}`}
      onClick={async () => {
        const ok = await confirm({
          title: 'ثبت پرداخت پاداش',
          body: (
            <p>
              پرداخت <strong>{formatToman(stats.unpaid)}</strong> به «{agent.name}» برای کمپین «{campaign.name}» ثبت می‌شود. این پرداخت پس از ثبت قابل ویرایش نیست.
            </p>
          ),
          confirmLabel: 'ثبت پرداخت',
        });
        if (ok) await exec({ type: 'payRewards', campaignId: campaign.id, agentId: agent.id, amount: stats.unpaid }, 'پرداخت ثبت شد.');
      }}
    >
      ثبت پرداخت
    </button>
  );
}

const dayOf = (ts: number) => formatDate(new Date(ts).toISOString().slice(0, 10));

export function Payments() {
  const { data, campaign, go } = useAdmin();
  const stats = useCampaignStats();
  if (!campaign || !stats) {
    return (
      <>
        <PageHead title="پرداخت‌ها" />
        <EmptyState title="کمپینی برای نمایش وجود ندارد" action={<button className="btn btn-primary" onClick={() => go('campaigns', 'new')}>طراحی کمپین</button>} />
      </>
    );
  }
  const t = campaignTotals(data, campaign);
  const rows = data.agents.filter((a) => stats.has(a.id)).map((a) => ({ a, s: stats.get(a.id)! })).filter((x) => x.s.payable > 0 || x.s.paid > 0);
  const payouts = data.payouts.filter((p) => p.campaignId === campaign.id).slice().reverse();
  const name = (id: string) => data.agents.find((a) => a.id === id)?.name ?? '—';

  return (
    <>
      <PageHead title="پرداخت‌ها" sub="پاداش بازه‌های تکمیل‌شده پس از تأیید فروش، اینجا قابل پرداخت می‌شود." actions={<CampaignSelect />} />
      <section className="kpis">
        <Kpi label="بودجه‌ی کمپین" value={t.budget === null ? 'بدون سقف' : formatToman(t.budget)} />
        <Kpi label="مبلغ تعهدشده" value={formatToman(t.committed)} sub={`در حال تکمیل: ${formatToman(t.accruing)}`} />
        <Kpi label="مبلغ پرداخت‌شده" value={formatToman(t.paid)} sub={`پرداخت‌نشده: ${formatToman(t.unpaid)}`} />
        <Kpi label="بودجه‌ی باقی‌مانده" value={t.remainingBudget === null ? '—' : formatToman(t.remainingBudget)} tone={t.remainingBudget !== null && t.remainingBudget < 0 ? 'warn' : undefined} sub={t.remainingBudget !== null && t.remainingBudget < 0 ? 'تعهد از بودجه فراتر رفته است' : 'بودجه منهای مبلغ تعهدشده'} />
      </section>

      <section className="card">
        <h2>پاداش کارگزاران</h2>
        {rows.length === 0 ? (
          <p className="muted">هنوز پاداشی برای پرداخت ایجاد نشده است. با تأیید فروش‌ها و تکمیل بازه‌ها، کارگزاران اینجا ظاهر می‌شوند.</p>
        ) : (
          <div className="table-wrap">
            <table className="data responsive">
              <thead>
                <tr>
                  <th>کارگزار</th>
                  <th>قابل پرداخت</th>
                  <th>پرداخت‌شده</th>
                  <th>پرداخت‌نشده</th>
                  <th>وضعیت</th>
                  <th />
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
                    <td data-label="قابل پرداخت">{formatToman(s.payable)}</td>
                    <td data-label="پرداخت‌شده">{formatToman(s.paid)}</td>
                    <td data-label="پرداخت‌نشده">{formatToman(s.unpaid)}</td>
                    <td data-label="وضعیت">
                      <StatusPill kind={s.paymentStatus} />
                    </td>
                    <td className="cell-actions">
                      <PayButton campaign={campaign} agent={a} stats={s} small />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>سوابق پرداخت</h2>
        {payouts.length === 0 ? (
          <p className="muted">پرداختی ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table className="data responsive">
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>کارگزار</th>
                  <th>مبلغ</th>
                  <th>نسخه‌ی موتور محاسبه</th>
                </tr>
              </thead>
              <tbody>
                {payouts.slice(0, 50).map((p) => (
                  <tr key={p.id}>
                    <td data-label="تاریخ">{dayOf(p.createdAt)}</td>
                    <td data-label="کارگزار">{name(p.agentId)}</td>
                    <td data-label="مبلغ">{formatToman(p.amount)}</td>
                    <td data-label="نسخه‌ی موتور" className="mono">{p.engineVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payouts.length > 50 && <p className="muted small">{formatInt(payouts.length - 50)} پرداخت قدیمی‌تر در خروجی CSV گزارش‌ها موجود است.</p>}
          </div>
        )}
      </section>
    </>
  );
}
