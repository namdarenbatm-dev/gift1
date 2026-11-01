import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { JALALI_MONTHS, formatInt, isoToJalali, jalaliToIso, parseIntegerInput, toLatinDigits, toPersianDigits, todayIso } from '../domain/numbers';
import type { TickerMessage } from '../domain/ticker';
import type { PaymentStatus } from '../domain/ledger';
import { PAYMENT_STATUS_LABEL } from '../domain/ledger';
import type { CampaignStatus, SaleStatus } from '../domain/types';
import { Icon } from './icons';

/* ---------------- numeric input ---------------- */

/** Formats raw typed text as Persian digits with thousands separators. Never shows a minus sign. */
export function formatTyped(raw: string): string {
  const digits = toLatinDigits(raw).replace(/\D/g, '');
  if (!digits) return '';
  return toPersianDigits(digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
}

export function numberFromTyped(text: string, max?: number): number | null {
  const p = parseIntegerInput(text, max);
  return p.ok ? p.value : null;
}

export function toTyped(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : formatInt(n);
}

interface NumberFieldProps {
  id?: string;
  value: string;
  onChange: (typed: string) => void;
  unit?: string;
  placeholder?: string;
  label?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
}

/**
 * Money / count input: starts empty, blocks negatives and letters while typing,
 * shows Persian digits with thousands separators, and keeps the caret stable.
 * The state holds the formatted text; use `numberFromTyped` to read the number.
 */
export function NumberField({ id, value, onChange, unit, placeholder, label, invalid, disabled, describedBy }: NumberFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingDigits = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const want = pendingDigits.current;
    if (!el || want === null) return;
    pendingDigits.current = null;
    let seen = 0;
    let pos = 0;
    if (want > 0) {
      for (pos = 0; pos < el.value.length; pos++) {
        if (/[۰-۹]/.test(el.value[pos])) seen += 1;
        if (seen === want) {
          pos += 1;
          break;
        }
      }
    }
    el.setSelectionRange(pos, pos);
  }, [value]);

  return (
    <span className={`numfield${invalid ? ' is-invalid' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input
        id={id}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir="rtl"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onChange={(e) => {
          const el = e.target;
          const caret = el.selectionStart ?? el.value.length;
          pendingDigits.current = (toLatinDigits(el.value.slice(0, caret)).match(/\d/g) ?? []).length;
          onChange(formatTyped(el.value));
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

/* ---------------- small display pieces ---------------- */

export function Field({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`field${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const CAMPAIGN_LABEL: Record<CampaignStatus, string> = { draft: 'پیش‌نویس', active: 'فعال', paused: 'متوقف', ended: 'پایان‌یافته' };
export const campaignStatusLabel = (s: CampaignStatus) => CAMPAIGN_LABEL[s];

export function StatusPill({ kind, children }: { kind: 'draft' | 'active' | 'paused' | 'ended' | 'pending' | 'approved' | 'rejected' | PaymentStatus; children?: ReactNode }) {
  const text =
    children ??
    (kind in CAMPAIGN_LABEL
      ? CAMPAIGN_LABEL[kind as CampaignStatus]
      : kind === 'pending'
        ? 'در انتظار تأیید'
        : kind === 'approved'
          ? 'تأییدشده'
          : kind === 'rejected'
            ? 'ردشده'
            : PAYMENT_STATUS_LABEL[kind as PaymentStatus]);
  return <span className={`pill pill-${kind}`}>{text}</span>;
}

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = { pending: 'در انتظار تأیید', approved: 'تأییدشده', rejected: 'ردشده' };

const TIER_CLASSES = ['t0', 't1', 't2', 't3', 't4', 't5'];
export function tierClass(index: number): string {
  return index < 0 ? 'tnone' : TIER_CLASSES[Math.min(index, TIER_CLASSES.length - 1)];
}

export function LevelBadge({ name, index }: { name: string | null; index: number }) {
  return <span className={`level ${tierClass(index)}`}>{name ?? 'شروع نشده'}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number | null; label?: string }) {
  if (percent === null) return <span className="muted small">بدون سقف</span>;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={label ?? 'پیشرفت'}>
      <span style={{ width: `${p}%` }} />
    </span>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <div className={`kpi${tone ? ` kpi-${tone}` : ''}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/* ---------------- the “خط جاری فروش” ---------------- */

/**
 * Animated sales line. The text comes from `buildTicker` (shared by both panels).
 * The same messages are always present as a static list for screen readers,
 * for people who prefer reduced motion, and for anyone who pauses the motion.
 */
export function Ticker({ messages, empty }: { messages: TickerMessage[]; empty?: string }) {
  const [paused, setPaused] = useState(false);
  if (messages.length === 0) {
    return (
      <div className="ticker ticker-empty" aria-label="خط جاری فروش">
        <span className="ticker-title">خط جاری فروش</span>
        <p>{empty ?? 'برای نمایش خط جاری فروش، سطح‌ها و نرخ‌های کمپین باید کامل باشند.'}</p>
      </div>
    );
  }
  const totalChars = messages.reduce((n, m) => n + m.text.length, 0);
  const duration = Math.max(28, Math.round(totalChars * 0.2));
  const strip = (
    <>
      {messages.map((m, i) => (
        <span className="ticker-msg" key={i}>
          <i className="stripe" aria-hidden="true" />
          {m.text}
        </span>
      ))}
    </>
  );
  return (
    <section className={`ticker${paused ? ' is-paused' : ''}`} aria-label="خط جاری فروش">
      <div className="ticker-head">
        <span className="ticker-title">خط جاری فروش</span>
        <button className="icon-btn icon-btn-sm ticker-toggle" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? 'ادامه‌ی حرکت نوار' : 'توقف حرکت نوار'}>
          <Icon name={paused ? 'play' : 'pause'} size={16} />
        </button>
      </div>
      <div className="ticker-window" aria-hidden="true">
        <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
          <div className="ticker-strip">{strip}</div>
          <div className="ticker-strip">{strip}</div>
        </div>
      </div>
      <ul className="ticker-static">
        {messages.map((m, i) => (
          <li key={i}>{m.text}</li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- the staircase ---------------- */

export interface LadderTier {
  name: string;
  start: number;
  end: number | null;
  rate: number | null;
}

/**
 * «پلکان»: each level is a capsule step (the logo's stripe motif), indented a little more than
 * the one below it. Finished steps are filled, the step being climbed is filling, the rest are empty.
 */
export function Ladder({ tiers, validSales, levelIndex, blockIndex }: { tiers: LadderTier[]; validSales: number; levelIndex: number; blockIndex: number }) {
  return (
    <ol className="ladder" aria-label="پلکان سطح‌ها">
      {tiers.map((t, i) => {
        const done = t.end !== null && validSales >= t.end;
        const current = i === blockIndex && !done;
        let pct = 0;
        if (done) pct = 100;
        else if (current) pct = t.end === null ? Math.min(100, Math.max(8, validSales - t.start + 1)) : Math.round(((validSales - (t.start - 1)) / (t.end - t.start + 1)) * 100);
        return (
          <li key={i} className={`step ${tierClass(i)}${done ? ' is-done' : ''}${current ? ' is-current' : ''}`} style={{ ['--i' as string]: i }}>
            <div className="step-text">
              <strong>{t.name}</strong>
              <span>{t.end === null ? `از دستگاه ${formatInt(t.start)} به بعد` : `دستگاه ${formatInt(t.start)} تا ${formatInt(t.end)}`}</span>
            </div>
            <div className="step-track" aria-hidden="true">
              <span style={{ width: `${Math.max(0, pct)}%` }} />
            </div>
            <div className="step-rate">
              {t.rate === null ? '—' : formatInt(t.rate)}
              <small>تومان برای هر دستگاه</small>
            </div>
            {i === levelIndex && <span className="step-here">سطح فعلی</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- charts (hand-drawn SVG, no library) ---------------- */

export function BarChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = Math.max(240, data.length * 22);
  const h = 120;
  const bw = Math.min(18, (w / Math.max(1, data.length)) * 0.62);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label={label} preserveAspectRatio="none">
        <line x1="0" x2={w} y1={h} y2={h} className="chart-axis" />
        {data.map((d, i) => {
          const bh = (d.value / max) * (h - 8);
          const x = w - (i + 1) * (w / data.length) + (w / data.length - bw) / 2;
          return (
            <g key={i}>
              <rect x={x} y={h - bh} width={bw} height={Math.max(bh, d.value ? 2 : 0)} rx="3" className="chart-bar">
                <title>{`${d.label}: ${formatInt(d.value)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <figcaption className="muted small">
        {data.length > 0 ? `از ${data[0].label} تا ${data[data.length - 1].label}` : ''}
      </figcaption>
    </figure>
  );
}

export function DistributionBars({ rows, total }: { rows: { label: string; count: number; cls: string }[]; total: number }) {
  return (
    <ul className="dist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="dist-label">{r.label}</span>
          <span className="dist-track">
            <span className={`dist-fill ${r.cls}`} style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
          </span>
          <span className="dist-count">{formatInt(r.count)}</span>
        </li>
      ))}
    </ul>
  );
}


/** Jalali date picker: year / month / day selects. Value is a Gregorian ISO date ('' = empty), so storage stays backend-friendly. */
export function JalaliDateField({ id, value, onChange, label, invalid }: { id: string; value: string; onChange: (iso: string) => void; label: string; invalid?: boolean }) {
  const fromValue = value ? isoToJalali(value) : null;
  const [part, setPart] = useState<{ y: number | null; m: number | null; d: number | null }>({ y: fromValue?.y ?? null, m: fromValue?.m ?? null, d: fromValue?.d ?? null });
  useEffect(() => {
    const j = value ? isoToJalali(value) : null;
    if (j) setPart({ y: j.y, m: j.m, d: j.d });
    else if (!value) setPart((p) => (p.y && p.m && p.d ? { y: null, m: null, d: null } : p));
  }, [value]);

  const nowJ = isoToJalali(todayIso());
  const base = nowJ?.y ?? 1405;
  const years = new Set<number>();
  for (let y = base - 2; y <= base + 5; y++) years.add(y);
  if (part.y) years.add(part.y);

  const maxDay = (y: number | null, m: number | null) => (m === null ? 31 : m <= 6 ? 31 : m <= 11 ? 30 : y && jalaliToIso(y, 12, 30) ? 30 : 29);
  const update = (next: { y: number | null; m: number | null; d: number | null }) => {
    const fixed = { ...next };
    if (fixed.d !== null && fixed.d > maxDay(fixed.y, fixed.m)) fixed.d = maxDay(fixed.y, fixed.m);
    setPart(fixed);
    const iso = fixed.y && fixed.m && fixed.d ? jalaliToIso(fixed.y, fixed.m, fixed.d) : null;
    onChange(iso ?? '');
  };
  const num = (v: string) => (v === '' ? null : Number(v));

  return (
    <div className="datefield" role="group" aria-label={label}>
      <select id={id} aria-label={`${label} — روز`} aria-invalid={invalid || undefined} value={part.d ?? ''} onChange={(e) => update({ ...part, d: num(e.target.value) })}>
        <option value="">روز</option>
        {Array.from({ length: maxDay(part.y, part.m) }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{formatInt(d)}</option>
        ))}
      </select>
      <select aria-label={`${label} — ماه`} aria-invalid={invalid || undefined} value={part.m ?? ''} onChange={(e) => update({ ...part, m: num(e.target.value) })}>
        <option value="">ماه</option>
        {JALALI_MONTHS.map((n, i) => (
          <option key={n} value={i + 1}>{n}</option>
        ))}
      </select>
      <select aria-label={`${label} — سال`} aria-invalid={invalid || undefined} value={part.y ?? ''} onChange={(e) => update({ ...part, y: num(e.target.value) })}>
        <option value="">سال</option>
        {[...years].sort((a, b) => a - b).map((y) => (
          <option key={y} value={y}>{toPersianDigits(String(y))}</option>
        ))}
      </select>
    </div>
  );
}
