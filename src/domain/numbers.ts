/** Number parsing and formatting helpers (Persian digits, thousands separators, Toman). */

export const MAX_RATE = 1_000_000_000; // Toman per device
export const MAX_QTY = 1_000_000; // devices
export const MAX_BUDGET = 1_000_000_000_000_000; // 10^15 Toman — keeps all products inside Number.MAX_SAFE_INTEGER

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
}

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA[Number(d)]);
}

export type ParsedNumber =
  | { ok: true; value: number | null } // null = empty field
  | { ok: false; message: string };

/**
 * Parses a user-typed non-negative integer. Accepts Persian/Arabic digits and
 * thousands separators (٬ , ، space). Rejects negatives, decimals and letters.
 */
export function parseIntegerInput(raw: string, max = Number.MAX_SAFE_INTEGER): ParsedNumber {
  const cleaned = toLatinDigits(String(raw ?? ''))
    .replace(/[٬,،\s‌‏‎]/g, '')
    .trim();
  if (cleaned === '') return { ok: true, value: null };
  if (cleaned.startsWith('-') || cleaned.startsWith('−')) return { ok: false, message: 'عدد منفی مجاز نیست.' };
  if (!/^\d+$/.test(cleaned)) return { ok: false, message: 'فقط رقم وارد کنید.' };
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || value > max) return { ok: false, message: 'عدد واردشده بیش از حد بزرگ است.' };
  return { ok: true, value };
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const n = Math.round(value);
  const sign = n < 0 ? '-' : '';
  return sign + toPersianDigits(String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
}

export function formatToman(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatInt(value)} تومان`;
}

/** Plain digits for CSV / machine use. */
export function rawInt(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(Math.round(value));
}

export function normalizeSerial(input: string): string {
  return toLatinDigits(String(input ?? ''))
    .replace(/[\s‌‏‎-]+/g, '')
    .toUpperCase();
}

/* ---------------- dates ---------------- */

const jalaliFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
});
const jalaliLongFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Jalali date like ۱۴۰۵/۰۸/۱۰. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso || !isIsoDate(iso)) return '—';
  return jalaliFmt.format(new Date(`${iso}T00:00:00Z`)).replace(/[‏‎]/g, '');
}

export function formatDateLong(iso: string | null | undefined): string {
  if (!iso || !isIsoDate(iso)) return '—';
  return jalaliLongFmt.format(new Date(`${iso}T00:00:00Z`));
}

export function todayIso(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/* ---------------- Jalali (Persian) calendar helpers ---------------- */
const jalaliPartsFmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

export interface JalaliParts { y: number; m: number; d: number }

/** Jalali year/month/day of a Gregorian ISO date (YYYY-MM-DD). */
export function isoToJalali(iso: string): JalaliParts | null {
  if (!isIsoDate(iso)) return null;
  const parts = jalaliPartsFmt.formatToParts(new Date(`${iso}T00:00:00Z`));
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const r = { y: get('year'), m: get('month'), d: get('day') };
  return Number.isFinite(r.y) && Number.isFinite(r.m) && Number.isFinite(r.d) ? r : null;
}

/** Gregorian ISO date for a Jalali date, or null if that Jalali date does not exist. */
export function jalaliToIso(y: number, m: number, d: number): string | null {
  if (![y, m, d].every(Number.isInteger) || m < 1 || m > 12 || d < 1 || d > 31 || y < 1200 || y > 1600) return null;
  // Nowruz (1 Farvardin) always falls between 19 and 22 March of year y+621.
  let nowruz: string | null = null;
  for (let day = 19; day <= 22 && !nowruz; day++) {
    const iso = `${y + 621}-03-${String(day).padStart(2, '0')}`;
    const j = isoToJalali(iso);
    if (j && j.y === y && j.m === 1 && j.d === 1) nowruz = iso;
  }
  if (!nowruz) return null;
  const ordinal = (m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30) + d;
  const iso = addDaysIso(nowruz, ordinal - 1);
  const back = isoToJalali(iso);
  return back && back.y === y && back.m === m && back.d === d ? iso : null;
}

/** Jalali date with Latin digits, e.g. 1405/08/10 — for CSV files and file names. */
export function formatDateLatin(iso: string | null | undefined, sep = '/'): string {
  const j = iso ? isoToJalali(iso) : null;
  return j ? `${j.y}${sep}${String(j.m).padStart(2, '0')}${sep}${String(j.d).padStart(2, '0')}` : '';
}
