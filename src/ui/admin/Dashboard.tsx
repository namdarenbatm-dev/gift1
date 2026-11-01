import { useMemo } from 'react';
import { addDaysIso, daysBetween, formatDate, formatInt, formatToman, todayIso } from '../../domain/numbers';
import { campaignAgentStats, campaignTotals } from '../../domain/ledger';
import { BarChart, DistributionBars, EmptyState, Kpi, LevelBadge, PageHead, tierClass } from '../widgets';
import { Icon } from '../icons';
import { CampaignSelect, useAdmin } from './context';

export function Dashboard() {
  const { data, campaign, go } = useAdmin();
  const today = todayIso();

  const active = data.campaigns.filter((c) => c.status === 'active');
  const totals = useMemo(() => active.map((c) => ({ c, t: campaignTotals(data, c) })), [data]);
  const sum = (f: (t: ReturnType<typeof campaignTotals>) => number) => totals.reduce((s, x) => s + f(x.t), 0);
  const budgeted = totals.filter((x) => x.t.budget !== null);

  const stats = useMemo(() => {
    if (!campaign) return null;
    const ids = data.agents.filter((a) => a.campaignIds.includes(campaign.id)).map((a) => a.id);
    return campaignAgentStats(data, campaign, ids);
  }, [data, campaign]);

  if (data.campaigns.length === 0) {
    return (
      <>
        <PageHead title="داشبورد" />
        <EmptyState
          title="هنوز کمپینی ثبت نشده است"
          action={
            <>
              <button className="btn btn-primary" onClick={() => go('campaigns', 'new')}>
                <Icon name="plus" size={18} /> طراحی کمپین جدید
              </button>
              <button className="btn btn-ghost" onClick={() => go('settings')}>
                بارگذاری داده‌ی نمونه
              </button>
            </>
          }
        >
          با طراحی اولین کمپین، فروش، پاداش و خط جاری فروش کارگزاران اینجا نمایش داده می‌شود.
        </EmptyState>
      </>
    );
  }

  const agentRows = stats && campaign ? data.agents.filter((a) => stats.has(a.id) && a.campaignIds.includes(campaign.id)) : [];
  const levelRows = campaign
    ? [
        { label: 'بدون سطح', count: agentRows.filter((a) => stats!.get(a.id)!.levelIndex < 0).length, cls: 'tnone' },
        ...campaign.tiers.map((t, i) => ({ label: t.name, count: agentRows.filter((a) => stats!.get(a.id)!.levelIndex === i).length, cls: tierClass(i) })),
      ]
    : [];

  const near = agentRows
    .map((a) => ({ a, s: stats!.get(a.id)! }))
    .filter((x) => x.s.progress && x.s.progress.remainingToBlock !== null && x.s.progress.remainingToBlock > 0)
    .sort((x, y) => (x.s.progress!.remainingToBlock as number) - (y.s.progress!.remainingToBlock as number))
    .slice(0, 5);

  // Trend: approved sales per day, last 30 days of the campaign.
  const trend = (() => {
    if (!campaign || !campaign.startDate) return [];
    const endDay = campaign.endDate && campaign.endDate < today ? campaign.endDate : today;
    const startDay = addDaysIso(endDay, -29) > campaign.startDate ? addDaysIso(endDay, -29) : campaign.startDate;
    if (endDay < startDay) return [];
    const counts = new Map<string, number>();
    for (const s of data.sales) if (s.campaignId === campaign.id && s.status === 'approved') counts.set(s.saleDate, (counts.get(s.saleDate) ?? 0) + 1);
    return Array.from({ length: daysBetween(startDay, endDay) + 1 }, (_, i) => {
      const d = addDaysIso(startDay, i);
      return { label: formatDate(d), value: counts.get(d) ?? 0 };
    });
  })();

  const latest = campaign ? data.sales.filter((s) => s.campaignId === campaign.id).slice(-8).reverse() : [];
  const agentName = (id: string) => data.agents.find((a) => a.id === id)?.name ?? '—';

  const notices: { text: string; to: string[]; tone: 'warn' | 'info' }[] = [];
  const pending = data.sales.filter((s) => s.status === 'pending').length;
  if (pending) notices.push({ text: `${formatInt(pending)} فروش در انتظار تأیید است.`, to: ['sales'], tone: 'warn' });
  const nearCount = agentRows.filter((a) => {
    const r = stats!.get(a.id)!.progress?.remainingToBlock;
    return r !== null && r !== undefined && r > 0 && r <= 5;
  }).length;
  if (nearCount) notices.push({ text: `${formatInt(nearCount)} کارگزار کمتر از ۶ فروش تا تکمیل بازه‌ی جاری فاصله دارند.`, to: ['agents'], tone: 'info' });
  for (const { c, t } of totals) {
    if (t.budget !== null && t.committed >= t.budget * 0.8) notices.push({ text: `تعهد پاداش کمپین «${c.name}» از ۸۰٪ بودجه گذشته است.`, to: ['payments'], tone: 'warn' });
    if (c.endDate) {
      const left = daysBetween(today, c.endDate);
      if (left >= 0 && left <= 7) notices.push({ text: `کمپین «${c.name}» ${left === 0 ? 'امروز' : `${formatInt(left)} روز دیگر`} پایان می‌یابد.`, to: ['campaigns', c.id], tone: 'info' });
    }
  }
  const overpaid = stats ? [...stats.values()].filter((s) => s.overpaid > 0).length : 0;
  if (overpaid) notices.push({ text: `${formatInt(overpaid)} کارگزار بیش از پاداش قابل پرداخت خود دریافت کرده‌اند.`, to: ['payments'], tone: 'warn' });
  const unpaid = sum((t) => t.unpaid);
  if (unpaid > 0) notices.push({ text: `${formatToman(unpaid)} پاداش تکمیل‌شده هنوز پرداخت نشده است.`, to: ['payments'], tone: 'info' });

  return (
    <>
      <PageHead title="داشبورد" sub="خلاصه‌ی کمپین‌های فعال و وضعیت شبکه‌ی کارگزاران" actions={<CampaignSelect />} />

      <section className="kpis" aria-label="شاخص‌های کلیدی">
        <Kpi label="کمپین‌های فعال" value={formatInt(active.length)} sub={`از ${formatInt(data.campaigns.length)} کمپین`} />
        <Kpi label="کل کارگزاران" value={formatInt(data.agents.length)} sub={`${formatInt(data.agents.filter((a) => a.active).length)} فعال`} />
        <Kpi label="مجموع فروش معتبر" value={formatInt(sum((t) => t.approved))} sub={`${formatInt(sum((t) => t.pending))} در انتظار تأیید`} />
        <Kpi label="پاداش محاسبه‌شده" value={formatToman(sum((t) => t.committed))} sub={`در حال تکمیل: ${formatToman(sum((t) => t.accruing))}`} />
        <Kpi label="پاداش پرداخت‌شده" value={formatToman(sum((t) => t.paid))} sub={`پرداخت‌نشده: ${formatToman(unpaid)}`} />
        <Kpi
          label="بودجه‌ی کمپین‌های فعال"
          value={budgeted.length ? formatToman(budgeted.reduce((s, x) => s + (x.t.budget as number), 0)) : '—'}
          sub={budgeted.length ? `باقی‌مانده: ${formatToman(budgeted.reduce((s, x) => s + (x.t.remainingBudget as number), 0))}` : 'بودجه‌ای تعیین نشده'}
          tone={budgeted.some((x) => (x.t.remainingBudget as number) < 0) ? 'warn' : undefined}
        />
      </section>

      {!campaign || !stats ? null : (
        <div className="grid-2">
          <section className="card">
            <h2>روند فروش معتبر</h2>
            {trend.some((d) => d.value > 0) ? <BarChart data={trend} label="تعداد فروش تأییدشده در هر روز" /> : <p className="muted">هنوز فروش تأییدشده‌ای در این کمپین ثبت نشده است.</p>}
          </section>

          <section className="card">
            <h2>توزیع کارگزاران بر اساس سطح</h2>
            {agentRows.length ? <DistributionBars rows={levelRows} total={agentRows.length} /> : <p className="muted">کارگزاری به این کمپین اختصاص داده نشده است.</p>}
          </section>

          <section className="card">
            <h2>نزدیک به حدنصاب</h2>
            {near.length ? (
              <ul className="rows">
                {near.map(({ a, s }) => (
                  <li key={a.id}>
                    <button className="row-link" onClick={() => go('agents', a.id)}>
                      <span>{a.name}</span>
                      <LevelBadge name={s.levelName} index={s.levelIndex} />
                      <strong>{formatInt(s.progress!.remainingToBlock)} فروش مانده</strong>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">کارگزاری با بازه‌ی در حال تکمیل وجود ندارد.</p>
            )}
          </section>

          <section className="card">
            <h2>آخرین فروش‌های ثبت‌شده</h2>
            {latest.length ? (
              <ul className="rows">
                {latest.map((s) => (
                  <li key={s.id} className="row-plain">
                    <span>{agentName(s.agentId)}</span>
                    <span className="mono">{s.serial}</span>
                    <span className="muted small">{formatDate(s.saleDate)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">فروشی ثبت نشده است.</p>
            )}
          </section>
        </div>
      )}

      <section className="card">
        <h2>اعلان‌های مدیریتی</h2>
        {notices.length ? (
          <ul className="rows">
            {notices.slice(0, 7).map((n, i) => (
              <li key={i}>
                <button className="row-link" onClick={() => go(...n.to)}>
                  <Icon name={n.tone === 'warn' ? 'alert' : 'info'} size={18} />
                  <span>{n.text}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">اعلان تازه‌ای وجود ندارد.</p>
        )}
      </section>
    </>
  );
}
