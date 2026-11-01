import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Repository } from '../data/repository';
import { envelope } from '../data/repository';
import type { Command, CommandResult } from '../domain/types';
import { Icon } from './icons';

/* ------------------------------------------------------------------ */
/* Toasts + confirm dialogs + online state                              */
/* ------------------------------------------------------------------ */

type ToastKind = 'ok' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; run: () => void };
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface CoreValue {
  repo: Repository;
  online: boolean;
  toast: (text: string, kind?: ToastKind, action?: ToastItem['action']) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  /** Runs an admin command; shows the error toast itself. */
  exec: (command: Command, successText?: string) => Promise<CommandResult>;
}

const CoreContext = createContext<CoreValue | null>(null);

export function useCore(): CoreValue {
  const v = useContext(CoreContext);
  if (!v) throw new Error('CoreProvider missing');
  return v;
}

export function CoreProvider({ repo, children, onChanged }: { repo: Repository; children: ReactNode; onChanged?: () => void }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const nextId = useRef(1);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const toast = useCallback((text: string, kind: ToastKind = 'ok', action?: ToastItem['action']) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text, action }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 15000 : kind === 'error' ? 7000 : 3800);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })),
    [],
  );

  const exec = useCallback(
    async (command: Command, successText?: string) => {
      let result: CommandResult;
      try {
        result = await repo.execute(envelope(command));
      } catch (e) {
        result = { ok: false, error: { code: 'NETWORK', message: (e as Error).message || 'خطای نامشخص' } };
      }
      if (result.ok) {
        if (successText) toast(successText, 'ok');
        onChanged?.();
      } else {
        toast(result.error.message, 'error');
      }
      return result;
    },
    [repo, toast, onChanged],
  );

  const value = useMemo(() => ({ repo, online, toast, confirm, exec }), [repo, online, toast, confirm, exec]);

  useEffect(() => {
    const handler = () => toast('نسخه‌ی تازه‌ی برنامه آماده است.', 'info', { label: 'بروزرسانی', run: () => window.dispatchEvent(new Event('tc:apply-update')) });
    window.addEventListener('tc:update-ready', handler);
    return () => window.removeEventListener('tc:update-ready', handler);
  }, [toast]);

  return (
    <CoreContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.text}</span>
            {t.action && (
              <button className="btn btn-sm btn-light" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      {dialog && (
        <Modal
          title={dialog.title}
          onClose={() => {
            dialog.resolve(false);
            setDialog(null);
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  dialog.resolve(false);
                  setDialog(null);
                }}
              >
                انصراف
              </button>
              <button
                className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                autoFocus
                onClick={() => {
                  dialog.resolve(true);
                  setDialog(null);
                }}
              >
                {dialog.confirmLabel ?? 'تأیید'}
              </button>
            </>
          }
        >
          {dialog.body}
        </Modal>
      )}
    </CoreContext.Provider>
  );
}

export function Modal({ title, children, footer, onClose, wide }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="بستن">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function OfflineChip() {
  const { online } = useCore();
  if (online) return null;
  return (
    <span className="chip chip-warn" role="status">
      <Icon name="offline" size={16} /> آفلاین؛ داده‌های ذخیره‌شده در دسترس است
    </span>
  );
}
