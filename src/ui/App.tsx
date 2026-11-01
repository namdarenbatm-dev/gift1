import { useEffect, useState } from 'react';
import type { Repository } from '../data/repository';
import type { Agent } from '../domain/types';
import { CoreProvider, useCore } from './core';
import { Icon } from './icons';
import { AdminApp } from './admin/AdminApp';
import { AgentApp } from './agent/AgentApp';

type Screen = { name: 'splash' } | { name: 'gate' } | { name: 'picker' } | { name: 'admin' } | { name: 'agent'; agentId: string };

/** Exactly five seconds, as specified. */
export const SPLASH_MS = 5000;

export function App({ repo, volatile }: { repo: Repository; volatile: boolean }) {
  return (
    <CoreProvider repo={repo} onChanged={() => window.dispatchEvent(new Event('tc:changed'))}>
      {volatile && (
        <div className="banner" role="alert">
          <Icon name="alert" size={18} /> ذخیره‌سازی مرورگر در دسترس نیست (مثلاً حالت خصوصی)؛ داده‌ها با بستن صفحه از بین می‌رود.
        </div>
      )}
      <Root />
    </CoreProvider>
  );
}

function Root() {
  const [screen, setScreen] = useState<Screen>({ name: 'splash' });

  useEffect(() => {
    if (screen.name !== 'splash') return;
    const t = window.setTimeout(() => setScreen({ name: 'gate' }), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, [screen.name]);

  const exit = () => {
    window.location.hash = '';
    setScreen({ name: 'gate' });
  };

  switch (screen.name) {
    case 'splash':
      return <Splash />;
    case 'gate':
      return <Gate onAdmin={() => setScreen({ name: 'admin' })} onAgent={() => setScreen({ name: 'picker' })} />;
    case 'picker':
      return <AgentPicker onPick={(agentId) => setScreen({ name: 'agent', agentId })} onBack={() => setScreen({ name: 'gate' })} />;
    case 'admin':
      return <AdminApp onExit={exit} />;
    case 'agent':
      return <AgentApp agentId={screen.agentId} onExit={exit} />;
  }
}

function Splash() {
  return (
    <div className="splash" role="status" aria-label="در حال بارگذاری">
      <div className="splash-inner">
        <img className="splash-logo" src="assets/tosan-techno-logo.png" alt="لوگوی توسن تکنو" width="262" height="192" />
        <h1>سامانه طراحی و مدیریت کمپین‌های فروش توسن تکنو</h1>
        <p className="splash-app" lang="en" dir="ltr">
          Techno Campgain
        </p>
        <div className="splash-bar" aria-hidden="true">
          <span style={{ animationDuration: `${SPLASH_MS}ms` }} />
        </div>
      </div>
    </div>
  );
}

function Gate({ onAdmin, onAgent }: { onAdmin: () => void; onAgent: () => void }) {
  return (
    <main className="gate">
      <div className="gate-inner">
        <img className="gate-logo" src="assets/tosan-techno-logo.png" alt="توسن تکنو" width="131" height="96" />
        <h1>
          به <span lang="en">Techno Campgain</span> خوش آمدید
        </h1>
        <p className="muted">نوع دسترسی خود را انتخاب کنید.</p>
        <div className="gate-options">
          <button className="gate-card" onClick={onAdmin}>
            <Icon name="chart" size={26} />
            <span>
              <strong>ورود به پنل مدیریت</strong>
              <small>طراحی کمپین، پلکان پاداش، کارگزاران، فروش و پرداخت‌ها</small>
            </span>
          </button>
          <button className="gate-card" onClick={onAgent}>
            <Icon name="users" size={26} />
            <span>
              <strong>ورود به پنل کارگزار</strong>
              <small>سطح فعلی، خط جاری فروش و پاداش شما</small>
            </span>
          </button>
        </div>
        <p className="gate-note">
          <Icon name="info" size={16} /> نسخه‌ی پایلوت: انتخاب نقش جایگزین ورود امن نیست و داده‌ها فقط در همین مرورگر ذخیره می‌شوند.
        </p>
      </div>
    </main>
  );
}

function AgentPicker({ onPick, onBack }: { onPick: (id: string) => void; onBack: () => void }) {
  const { repo } = useCore();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    repo
      .getAdminSnapshot()
      .then((d) => setAgents(d.agents))
      .catch((e: Error) => setError(e.message));
  }, [repo]);

  const list = (agents ?? []).filter((a) => a.active && (!q.trim() || a.name.includes(q.trim()) || a.code.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <main className="gate">
      <div className="gate-inner">
        <img className="gate-logo" src="assets/tosan-techno-logo.png" alt="توسن تکنو" width="131" height="96" />
        <h1>کدام کارگزار هستید؟</h1>
        <p className="muted">در نسخه‌ی پایلوت، کارگزار از فهرست انتخاب می‌شود. در نسخه‌ی عملیاتی با ورود امن جایگزین خواهد شد.</p>
        {error && <p className="error">{error}</p>}
        {agents && agents.length === 0 && <p className="note">هنوز کارگزاری ثبت نشده است. ابتدا از «پنل مدیریت» کارگزار اضافه کنید.</p>}
        {agents && agents.length > 6 && <input aria-label="جستجوی کارگزار" placeholder="جستجوی نام یا شناسه" value={q} onChange={(e) => setQ(e.target.value)} />}
        <ul className="picker">
          {list.map((a) => (
            <li key={a.id}>
              <button className="gate-card" onClick={() => onPick(a.id)}>
                <span>
                  <strong>{a.name}</strong>
                  <small className="mono">{a.code}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-ghost" onClick={onBack}>
          بازگشت
        </button>
      </div>
    </main>
  );
}
