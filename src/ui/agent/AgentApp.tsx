import { useEffect, useState } from 'react';
import type { AgentCampaignView, AgentSnapshot } from '../../domain/projections';
import { daysBetween, formatDate, formatInt, formatToman, todayIso } from '../../domain/numbers';
import { OfflineChip, useCore } from '../core';
import { Icon } from '../icons';
import { EmptyState, Kpi, Ladder, LevelBadge, ProgressBar, SALE_STATUS_LABEL, StatusPill, Ticker } from '../widgets';

export function AgentApp({ agentId, onExit }: { agentId: string; onExit: () => void }) {
  const { repo } = useCore();
  const [snap, setSnap] = useState<AgentSnapshot | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    repo
      .getAgentSnapshot(agentId)
      .then((s) => alive && (setSnap(s), setError(null)))
      .catch((e: Error) => alive && setError(e.message || 'بارگذاری ناموفق بود.'));
    return () => {
      alive = false;
    };
  }, [repo, agentId, tick]);

  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && setTick((t) => t + 1);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('tc:changed', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('tc:changed', refresh);
    };
  }, []);

  const view = snap?.campaigns.find((c) => c.campaign.id === campaignId) ?? snap?.campaigns.find((c) => c.campaign.status === 'active') ?? snap?.campaigns[0] ?? null;

  return (
    <div className="agent-shell">
      <header className="agent-top">
        <img src="assets/tosan-techno-logo.png" alt="توسن تکنو" />
        <div className="who">
          <strong>{snap ? snap.agent.name : 'پنل کارگزار'}</strong>
          {snap && <span className="mono muted small">{snap.agent.code}</span>}
        </div>
        <OfflineChip />
        <button className="icon-btn" onClick={onExit} aria-label="خروج از پنل کارگزار" title="خروج">
          <Icon name="out" />
        </button>
      </header>

      <main className="agent-main" id="main">
        {snap === undefined && !error && <p className="muted center">در حال بارگذاری…</p>}
        {error && (
          <div className="loading-screen">
            <p className="error">{error}</p>
            <button className="btn btn-primary" onClick={() => setTick((t) => t + 1)}>
              تلاش دوباره
            </button>
          </div>
        )}
        {snap === null && (
          <EmptyState title="این کارگزار پیدا نشد" action={<button className="btn btn-primary" onClick={onExit}>بازگشت</button>}>
            شاید اطلاعات مرورگر پاک شده یا حساب حذف شده باشد.
          </EmptyState>
        )}
        {snap && !snap.agent.active && (
          <EmptyState title="حساب شما غیرفعال است" action={<button className="btn btn-primary" onClick={onExit}>بازگشت</button>}>
            برای فعال‌سازی با مدیریت فروش توسن تکنو تماس بگیرید.
          </EmptyState>
        )}
        {snap && snap.agent.active && snap.campaigns.length === 0 && (
          <EmptyState title="کمپین فعالی برای شما نیست" action={<button className="btn btn-primary" onClick={onExit}>بازگشت</button>}>
            هر زمان مدیریت شما را به یک کمپین اضافه کند، سطح و پاداش‌تان اینجا نمایش داده می‌شود.
          </EmptyState>
        )}
        {snap && snap.agent.active && view && (
          <>
            {snap.campaigns.length > 1 && (
              <div className="select-inline agent-select">
                <label htmlFor="agent-campaign">کمپین</label>
                <select id="agent-campaign" value={view.campaign.id} onChange={(e) => setCampaignId(e.target.value)}>
                  {snap.campaigns.map((c) => (
                    <option key={c.campaign.id} value={c.campaign.id}>
                      {c.campaign.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <CampaignView view={view} />
          </>
        )}
      </main>
    </div>
  );
}

function CampaignView({ view }: { view: AgentCampaignView }) {
  const { campaign: c, stats: s } = view;
  const p = s.progress;
  const left = c.endDate ? daysBetween(todayIso(), c.endDate) : null;
  const next = p && p.nextLevelIndex !== null ? c.tiers[p.nextLevelIndex] : null;
  const nextBlock = p ? c.tiers[p.blockIndex] : null;

  return (
    <>
      <div className="campaign-title">
        <h1>{c.name}</h1>
        <p className="muted small">
          {c.startDate && c.endDate ? `از ${formatDate(c.startDate)} تا ${formatDate(c.endDate)}` : ''}
          {left !== null && c.status === 'active' ? (left >= 0 ? ` · ${formatInt(left)} روز تا پایان` : ' · مهلت کمپین تمام شده است') : ''}
        </p>
        {c.status !== 'active' && (
          <p className="note">
            <Icon name="info" size={16} /> {c.status === 'paused' ? 'این کمپین موقتاً متوقف است.' : 'این کمپین پایان یافته است.'}
          </p>
        )}
      </div>

      <Ticker messages={s.messages} empty="این کمپین هنوز کامل تنظیم نشده است؛ پس از تکمیل، خط جاری فروش شما اینجا نمایش داده می‌شود." />

      {p ? (
        <section className="answers" aria-label="وضعیت شما در یک نگاه">
          <article className="answer">
            <h2>الان در چه سطحی هستم؟</h2>
            <div className="answer-main">
              <LevelBadge name={s.levelName} index={s.levelIndex} />
            </div>
            <p>
              <strong>{formatInt(s.approved)}</strong> فروش معتبر
              {s.pending > 0 && <span className="muted"> · {formatInt(s.pending)} در انتظار تأیید</span>}
            </p>
          </article>

          <article className="answer">
            <h2>چقدر تا پاداش بعدی فاصله دارم؟</h2>
            {p.remainingToBlock !== null && nextBlock ? (
              <>
                <div className="answer-main">
                  <strong className="big">{formatInt(p.remainingToBlock)}</strong> <span>فروش دیگر</span>
                </div>
                <ProgressBar percent={s.blockPercent} label={`پیشرفت بازه ${nextBlock.name}`} />
                <p>
                  با تکمیل بازه «{nextBlock.name}»، <strong>{formatToman(p.blockReward)}</strong> قابل پرداخت می‌شود.
                </p>
              </>
            ) : (
              <>
                <div className="answer-main">
                  <strong className="big">{formatToman(p.blockRate)}</strong>
                </div>
                <p>برای هر دستگاه جدید در سطح نهایی پرداخت می‌شود؛ منتظر تکمیل بازه نمانید.</p>
              </>
            )}
          </article>

          <article className="answer">
            <h2>با چند فروش دیگر به سطح بعدی می‌رسم؟</h2>
            {next && p.toNextLevel !== null ? (
              <>
                <div className="answer-main">
                  <strong className="big">{formatInt(p.toNextLevel)}</strong> <span>فروش دیگر تا «{next.name}»</span>
                </div>
                <p>
                  نرخ پاداش هر دستگاه در این سطح: <strong>{formatToman(next.rate)}</strong>
                </p>
              </>
            ) : (
              <>
                <div className="answer-main">
                  <strong className="big">بالاترین سطح</strong>
                </div>
                <p>
                  شما به سطح «{s.levelName}» رسیده‌اید. نرخ هر دستگاه جدید: <strong>{formatToman(nextBlock?.rate)}</strong>
                </p>
              </>
            )}
          </article>
        </section>
      ) : (
        <p className="note">
          <Icon name="info" size={16} /> سطح‌ها و نرخ‌های این کمپین هنوز کامل نشده است.
        </p>
      )}

      <section className="kpis kpis-agent" aria-label="پاداش">
        <Kpi label="پاداش تکمیل‌شده" value={formatToman(s.payable)} sub="پس از تأیید فروش‌ها قابل پرداخت است" />
        <Kpi label="پاداش بازه‌ی در حال تکمیل" value={formatToman(s.accruing)} sub="با تکمیل بازه به پاداش قابل پرداخت اضافه می‌شود" />
        <Kpi label="پرداخت‌شده" value={formatToman(s.paid)} sub={<StatusPill kind={s.paymentStatus} />} />
        <Kpi label="تاریخ پایان کمپین" value={formatDate(c.endDate)} sub={left !== null && left >= 0 ? `${formatInt(left)} روز باقی‌مانده` : undefined} />
      </section>

      {p && (
        <section className="card">
          <h2>پلکان سطح‌ها</h2>
          <Ladder tiers={c.tiers} validSales={s.approved} levelIndex={p.levelIndex} blockIndex={p.blockIndex} />
        </section>
      )}

      {(c.validSaleRules || c.tierCompletionRules || c.payoutRules) && (
        <details className="card rules">
          <summary>قوانین کمپین</summary>
          {c.validSaleRules && (
            <p>
              <strong>فروش معتبر:</strong> {c.validSaleRules}
            </p>
          )}
          {c.tierCompletionRules && (
            <p>
              <strong>تکمیل سطح:</strong> {c.tierCompletionRules}
            </p>
          )}
          {c.payoutRules && (
            <p>
              <strong>پرداخت پاداش:</strong> {c.payoutRules}
            </p>
          )}
        </details>
      )}

      <section className="card">
        <h2>سوابق فروش من</h2>
        {view.sales.length === 0 ? (
          <p className="muted">هنوز فروشی برای شما ثبت نشده است. فروش‌ها توسط مدیریت ثبت و تأیید می‌شوند.</p>
        ) : (
          <ul className="rows">
            {view.sales.slice(0, 30).map((x) => (
              <li key={x.id} className="row-plain sale-row">
                <span className="mono">{x.serial}</span>
                <span className="muted small">{formatDate(x.saleDate)}</span>
                <StatusPill kind={x.status}>{SALE_STATUS_LABEL[x.status]}</StatusPill>
              </li>
            ))}
          </ul>
        )}
        {view.sales.length > 30 && <p className="muted small">{formatInt(view.sales.length - 30)} فروش قدیمی‌تر نمایش داده نشده است.</p>}
      </section>

      {view.payouts.length > 0 && (
        <section className="card">
          <h2>پرداخت‌های دریافتی</h2>
          <ul className="rows">
            {view.payouts.map((x) => (
              <li key={x.id} className="row-plain">
                <span>{formatDate(new Date(x.createdAt).toISOString().slice(0, 10))}</span>
                <strong>{formatToman(x.amount)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
