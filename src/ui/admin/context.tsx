import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { campaignAgentStats } from '../../domain/ledger';
import type { AdminSnapshot } from '../../domain/projections';
import type { Campaign } from '../../domain/types';
import { useCore } from '../core';

export function useHashRoute(prefix: string) {
  const read = () => {
    const h = window.location.hash.replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    return parts[0] === prefix ? parts.slice(1) : [];
  };
  const [path, setPath] = useState<string[]>(read);
  useEffect(() => {
    const onHash = () => {
      setPath(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix]);
  const go = useCallback(
    (...segments: string[]) => {
      window.location.hash = `/${[prefix, ...segments].join('/')}`;
    },
    [prefix],
  );
  return { path, go };
}

interface AdminCtx {
  data: AdminSnapshot;
  campaign: Campaign | null;
  selectCampaign: (id: string) => void;
  go: (...segments: string[]) => void;
  path: string[];
}

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('AdminProvider missing');
  return v;
}

const SEL_KEY = 'techno-campgain:selected-campaign';

export function AdminProvider({ children }: { children: (ctx: AdminCtx | null, state: { error: string | null; retry: () => void }) => ReactNode }) {
  const { repo } = useCore();
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SEL_KEY);
    } catch {
      return null;
    }
  });
  const { path, go } = useHashRoute('admin');

  useEffect(() => {
    let alive = true;
    repo
      .getAdminSnapshot()
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => alive && setError(e.message || 'بارگذاری داده‌ها ناموفق بود.'));
    return () => {
      alive = false;
    };
  }, [repo, tick]);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('tc:changed', on);
    // Another tab changed the data: refresh when this tab becomes visible again.
    const vis = () => document.visibilityState === 'visible' && on();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('tc:changed', on);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  const selectCampaign = useCallback((id: string) => {
    setSelected(id);
    try {
      sessionStorage.setItem(SEL_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  if (!data) return <>{children(null, { error, retry: () => setTick((t) => t + 1) })}</>;

  const campaign =
    data.campaigns.find((c) => c.id === selected) ??
    data.campaigns.find((c) => c.status === 'active') ??
    data.campaigns[0] ??
    null;

  return <Ctx.Provider value={{ data, campaign, selectCampaign, go, path }}>{children({ data, campaign, selectCampaign, go, path }, { error, retry: () => setTick((t) => t + 1) })}</Ctx.Provider>;
}

/** Per-agent stats of the selected campaign, computed in one pass over the ledger. */
export function useCampaignStats() {
  const { data, campaign } = useAdmin();
  return useMemo(
    () => (campaign ? campaignAgentStats(data, campaign, data.agents.filter((a) => a.campaignIds.includes(campaign.id)).map((a) => a.id)) : null),
    [data, campaign],
  );
}

export function CampaignSelect({ id = 'campaign-select' }: { id?: string }) {
  const { data, campaign, selectCampaign } = useAdmin();
  if (data.campaigns.length === 0) return null;
  return (
    <div className="select-inline">
      <label htmlFor={id}>کمپین</label>
      <select id={id} value={campaign?.id ?? ''} onChange={(e) => selectCampaign(e.target.value)}>
        {data.campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
