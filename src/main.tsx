import { createRoot } from 'react-dom/client';
import { createLocalStorageRepository } from './data/localStorageRepository';
import type { StorageLike } from './data/localStorageRepository';
import { App } from './ui/App';
import './styles.css';

/** localStorage can be missing or throw (private mode, blocked site data). Fall back to memory and say so. */
function pickStorage(): { storage: StorageLike; volatile: boolean } {
  try {
    const probe = '__tc_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { storage: window.localStorage, volatile: false };
  } catch {
    const mem = new Map<string, string>();
    return {
      volatile: true,
      storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) },
    };
  }
}

const { storage, volatile } = pickStorage();
const repo = createLocalStorageRepository(storage);

createRoot(document.getElementById('root') as HTMLElement).render(<App repo={repo} volatile={volatile} />);

/* ---------------- Service worker (versioned, with an update prompt) ---------------- */
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  // Only reload on controller change when updating an already-controlled page — never on the very first install (it would restart the splash).
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const announce = () => navigator.serviceWorker.controller && window.dispatchEvent(new Event('tc:update-ready'));
        if (reg.waiting) announce();
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => w.state === 'installed' && announce());
        });
        window.addEventListener('tc:apply-update', () => reg.waiting?.postMessage('SKIP_WAITING'));
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading || !hadController) return;
          reloading = true;
          window.location.reload();
        });
      })
      .catch(() => {
        /* the app keeps working online without a service worker */
      });
  });
}
