import { useEffect } from 'react';
import { OfflineChip } from '../core';
import { Icon } from '../icons';
import type { IconName } from '../icons';
import { AdminProvider, useAdmin } from './context';
import { Dashboard } from './Dashboard';
import { Campaigns } from './Campaigns';
import { Agents } from './Agents';
import { Sales } from './Sales';
import { Payments } from './Payments';
import { Reports } from './Reports';
import { Settings } from './Settings';
import { PageHead } from '../widgets';

const NAV: { path: string; label: string; icon: IconName }[] = [
  { path: 'dashboard', label: 'داشبورد', icon: 'home' },
  { path: 'campaigns', label: 'کمپین‌ها', icon: 'flag' },
  { path: 'agents', label: 'کارگزاران', icon: 'users' },
  { path: 'sales', label: 'فروش', icon: 'receipt' },
  { path: 'payments', label: 'پرداخت‌ها', icon: 'wallet' },
  { path: 'reports', label: 'گزارش‌ها', icon: 'chart' },
  { path: 'settings', label: 'تنظیمات', icon: 'gear' },
];
const MOBILE = ['dashboard', 'campaigns', 'agents', 'sales'];

export function AdminApp({ onExit }: { onExit: () => void }) {
  useEffect(() => {
    if (!window.location.hash.startsWith('#/admin')) window.location.hash = '/admin/dashboard';
  }, []);
  return (
    <AdminProvider>
      {(ctx, state) =>
        !ctx ? (
          <div className="loading-screen">
            {state.error ? (
              <>
                <p className="error">{state.error}</p>
                <button className="btn btn-primary" onClick={state.retry}>
                  تلاش دوباره
                </button>
              </>
            ) : (
              <p className="muted">در حال بارگذاری…</p>
            )}
          </div>
        ) : (
          <Shell onExit={onExit} />
        )
      }
    </AdminProvider>
  );
}

function More({ onExit }: { onExit: () => void }) {
  const { go } = useAdmin();
  return (
    <>
      <PageHead title="بیشتر" />
      <ul className="more-list">
        {NAV.filter((n) => !MOBILE.includes(n.path)).map((n) => (
          <li key={n.path}>
            <button className="row-link" onClick={() => go(n.path)}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </button>
          </li>
        ))}
        <li>
          <button className="row-link" onClick={onExit}>
            <Icon name="out" />
            <span>تغییر دسترسی</span>
          </button>
        </li>
      </ul>
    </>
  );
}

function Shell({ onExit }: { onExit: () => void }) {
  const { path, go } = useAdmin();
  const page = path[0] ?? 'dashboard';
  const moreActive = !MOBILE.includes(page);

  const content = (() => {
    switch (page) {
      case 'campaigns':
        return <Campaigns />;
      case 'agents':
        return <Agents />;
      case 'sales':
        return <Sales />;
      case 'payments':
        return <Payments />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      case 'more':
        return <More onExit={onExit} />;
      default:
        return <Dashboard />;
    }
  })();

  return (
    <div className="admin-shell">
      <aside className="sidebar" aria-label="منوی اصلی">
        <div className="brand">
          <img src="assets/tosan-techno-logo.png" alt="توسن تکنو" />
          <span>Techno Campgain</span>
        </div>
        <nav>
          <ul>
            {NAV.map((n) => (
              <li key={n.path}>
                <a href={`#/admin/${n.path}`} className={page === n.path ? 'on' : ''} aria-current={page === n.path ? 'page' : undefined}>
                  <Icon name={n.icon} />
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <button className="side-exit" onClick={onExit}>
          <Icon name="out" size={18} /> تغییر دسترسی
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <img src="assets/tosan-techno-logo.png" alt="توسن تکنو" />
          <strong>پنل مدیریت</strong>
          <OfflineChip />
        </header>
        <main className="content" id="main">
          <div className="desk-chip">
            <OfflineChip />
          </div>
          {content}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="منوی موبایل">
        {NAV.filter((n) => MOBILE.includes(n.path)).map((n) => (
          <a key={n.path} href={`#/admin/${n.path}`} className={page === n.path ? 'on' : ''} aria-current={page === n.path ? 'page' : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
        <button className={moreActive ? 'on' : ''} onClick={() => go('more')} aria-label="بیشتر">
          <Icon name="dots" />
          <span>بیشتر</span>
        </button>
      </nav>
    </div>
  );
}
