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

type TcSession = { user: { id: string; email?: string } };
type TcProfile = { id: string; full_name: string | null; role: string; is_active: boolean; broker_id: string | null };
type TcAuthClient = {
  auth: {
    getSession(): Promise<{ data: { session: TcSession | null }; error: { message: string } | null }>;
    onAuthStateChange(callback: (event: string, session: TcSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
    signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { session: TcSession | null }; error: { message: string } | null }>;
    signOut(): Promise<{ error: { message: string } | null }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: TcProfile | null; error: { message: string } | null }>;
      };
    };
  };
};
declare global {
  interface Window {
    supabase?: { createClient(url: string, key: string): TcAuthClient };
    SNI_SUPABASE_CONFIG?: { url: string; publishableKey: string };
    __tcAuthClient?: TcAuthClient;
  }
}

function Root() {
  const [splashDone, setSplashDone] = useState(false);
  const [authState, setAuthState] = useState<'checking' | 'signedOut' | 'ready' | 'blocked'>('checking');
  const [identity, setIdentity] = useState<{ email: string; fullName: string; role: string } | null>(null);
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const cfg = window.SNI_SUPABASE_CONFIG;
    if (!cfg || !window.supabase?.createClient) {
      setAuthError('تنظیمات اتصال یکپارچه در دسترس نیست. صفحه را دوباره بارگذاری کنید.');
      setAuthState('blocked');
      return;
    }
    const client = window.supabase.createClient(cfg.url, cfg.publishableKey);
    window.__tcAuthClient = client;
    let active = true;
    let sequence = 0;

    const acceptSession = async (session: TcSession | null) => {
      const current = ++sequence;
      if (!session) {
        if (!active || current !== sequence) return;
        setIdentity(null);
        setAuthError('');
        setAuthState('signedOut');
        return;
      }
      const { data, error } = await client
        .from('profiles')
        .select('id,full_name,role,is_active,broker_id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!active || current !== sequence) return;
      if (error || !data || !data.is_active) {
        setIdentity(null);
        setAuthError(error?.message || 'حساب کاربری فعال در SNI CRM پیدا نشد.');
        setAuthState('blocked');
        return;
      }
      // The current campaign pilot stores data locally and has no broker-to-agent identity map.
      // Only the verified super-admin profile is allowed into its management workspace.
      if (data.role !== 'super_admin') {
        setIdentity(null);
        setAuthError('حساب شما احراز هویت شد، اما دسترسی پنل مدیریت کمپین فعلاً فقط برای مدیر کل سامانه فعال است.');
        setAuthState('blocked');
        return;
      }
      setIdentity({
        email: session.user.email || '',
        fullName: data.full_name || session.user.email || 'مدیر سامانه',
        role: data.role,
      });
      setAuthError('');
      setAuthState('ready');
    };

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      void acceptSession(session);
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthError('بررسی نشست ورود ناموفق بود: ' + error.message);
        setAuthState('blocked');
      } else {
        void acceptSession(data.session);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const client = window.__tcAuthClient;
    if (!client) {
      setAuthError('اتصال احراز هویت برقرار نیست. صفحه را دوباره بارگذاری کنید.');
      return;
    }
    setBusy(true);
    setAuthError('');
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setAuthError('ورود ناموفق بود: ' + error.message);
    // Successful sign-in is picked up by onAuthStateChange and shares the same
    // Supabase localStorage session used by SNI CRM on this GitHub Pages origin.
  };

  const signOut = async () => {
    const client = window.__tcAuthClient;
    if (client) {
      const { error } = await client.auth.signOut();
      if (error) setAuthError('خروج ناموفق بود: ' + error.message);
    }
  };

  if (!splashDone) return <Splash />;
  if (authState === 'checking') {
    return <main className="gate"><div className="gate-inner"><h1>در حال بررسی نشست یکپارچه…</h1><p className="muted">در حال اتصال امن به حساب SNI CRM</p></div></main>;
  }
  if (authState !== 'ready' || !identity) {
    return <AuthGate error={authError} busy={busy} onSubmit={signIn} onSignOut={signOut} />;
  }

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 16px', background: '#00386e', color: '#fff', boxShadow: '0 2px 12px #001d3a22' }}>
        <span style={{ fontSize: 13 }}>ورود یکپارچه · {identity.fullName} · {identity.email}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a href="../admin/crm/" style={{ color: '#fff', fontSize: 13, alignSelf: 'center' }}>بازگشت به SNI CRM</a>
          <button className="btn btn-light btn-sm" onClick={signOut}>خروج از هر دو سامانه</button>
        </div>
      </div>
      <AdminApp onExit={signOut} />
    </div>
  );
}

function AuthGate({ error, busy, onSubmit, onSignOut }: {
  error: string;
  busy: boolean;
  onSubmit: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <main className="gate">
      <div className="gate-inner" style={{ maxWidth: 460 }}>
        <img className="gate-logo" src="assets/tosan-techno-logo.png" alt="توسن تکنو" width="131" height="96" />
        <h1>ورود یکپارچه به سامانه‌ها</h1>
        <p className="muted">با همان حساب SNI CRM وارد شوید. اگر قبلاً در CRM وارد شده باشید، نیازی به ورود مجدد نیست.</p>
        <form onSubmit={(e) => { e.preventDefault(); void onSubmit(email, password); }} style={{ display: 'grid', gap: 12, marginTop: 20, textAlign: 'right' }}>
          <label className="field"><label htmlFor="tc-email">ایمیل حساب</label><input id="tc-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><label htmlFor="tc-password">رمز عبور</label><input id="tc-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'در حال ورود…' : 'ورود با حساب SNI CRM'}</button>
          <a className="btn btn-ghost" href="../admin/crm/" style={{ textAlign: 'center', textDecoration: 'none' }}>رفتن به SNI CRM</a>
          <button className="link" type="button" onClick={() => void onSignOut()}>خروج از نشست فعلی</button>
        </form>
        <p className="gate-note" style={{ marginTop: 18 }}>نشست ورود بین دو سامانه مشترک است؛ خروج از یکی، نشست هر دو را می‌بندد.</p>
      </div>
    </main>
  );
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
