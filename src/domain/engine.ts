import type { Campaign, CampaignInput, Issue, Tier, TierInput } from './types';
import { MAX_BUDGET, MAX_QTY, MAX_RATE, isIsoDate } from './numbers';

type TierLike = Pick<Tier, 'name' | 'endQty' | 'rate'>;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Validates a campaign definition.
 * - `draft`: only identity fields are required, tier problems are not reported.
 * - `publish`: everything needed to calculate rewards must be present and consistent.
 */
export function validateCampaign(c: CampaignInput | Campaign, mode: 'draft' | 'publish'): Issue[] {
  const issues: Issue[] = [];
  if (!c.name.trim()) issues.push({ field: 'name', message: 'نام کمپین را وارد کنید.' });
  if (!c.code.trim()) issues.push({ field: 'code', message: 'شناسه‌ی کمپین را وارد کنید.' });

  if (c.budget !== null && (!Number.isSafeInteger(c.budget) || c.budget < 1 || c.budget > MAX_BUDGET)) {
    issues.push({ field: 'budget', message: 'بودجه باید عدد صحیح مثبت باشد.' });
  }
  if (c.startDate && !isIsoDate(c.startDate)) issues.push({ field: 'startDate', message: 'تاریخ شروع معتبر نیست.' });
  if (c.endDate && !isIsoDate(c.endDate)) issues.push({ field: 'endDate', message: 'تاریخ پایان معتبر نیست.' });
  if (c.startDate && c.endDate && isIsoDate(c.startDate) && isIsoDate(c.endDate) && c.endDate < c.startDate) {
    issues.push({ field: 'endDate', message: 'تاریخ پایان نباید قبل از تاریخ شروع باشد.' });
  }

  if (mode === 'publish') {
    if (!c.startDate) issues.push({ field: 'startDate', message: 'تاریخ شروع را وارد کنید.' });
    if (!c.endDate) issues.push({ field: 'endDate', message: 'تاریخ پایان را وارد کنید.' });
    issues.push(...validateTiers(c.tiers));
  }
  return issues;
}

export function validateTiers(tiers: readonly TierLike[]): Issue[] {
  const issues: Issue[] = [];
  if (tiers.length === 0) {
    issues.push({ field: 'tiers', message: 'دست‌کم یک سطح تعریف کنید.' });
    return issues;
  }
  let prevEnd = 0;
  tiers.forEach((t, i) => {
    const isLast = i === tiers.length - 1;
    const label = t.name.trim() || `سطح ${i + 1}`;
    if (!t.name.trim()) issues.push({ field: `tiers.${i}.name`, message: `عنوان سطح ${i + 1} را وارد کنید.` });
    if (isLast) {
      if (t.endQty !== null) issues.push({ field: `tiers.${i}.endQty`, message: `سطح آخر (${label}) باید بدون سقف باشد.` });
    } else if (t.endQty === null) {
      issues.push({ field: `tiers.${i}.endQty`, message: `حدنصاب سطح «${label}» را وارد کنید.` });
    } else if (!Number.isSafeInteger(t.endQty) || t.endQty < 1 || t.endQty > MAX_QTY) {
      issues.push({ field: `tiers.${i}.endQty`, message: `حدنصاب سطح «${label}» باید عدد صحیح مثبت باشد.` });
    } else if (t.endQty <= prevEnd) {
      issues.push({ field: `tiers.${i}.endQty`, message: `حدنصاب سطح «${label}» باید از سطح قبل بیشتر باشد.` });
    }
    if (t.endQty !== null && Number.isSafeInteger(t.endQty) && t.endQty > prevEnd) prevEnd = t.endQty;
    if (t.rate === null) {
      issues.push({ field: `tiers.${i}.rate`, message: `نرخ پاداش سطح «${label}» را وارد کنید.` });
    } else if (!Number.isSafeInteger(t.rate) || t.rate < 0 || t.rate > MAX_RATE) {
      issues.push({ field: `tiers.${i}.rate`, message: `نرخ پاداش سطح «${label}» معتبر نیست.` });
    }
  });
  return issues;
}

/** True when every tier is complete and consistent, so rewards can be computed. */
export function isCalculable(tiers: readonly TierLike[]): boolean {
  return validateTiers(tiers).length === 0;
}

/* ------------------------------------------------------------------ */
/* Reward calculation                                                  */
/* ------------------------------------------------------------------ */

export interface TierRange {
  /** First device number of the tier (1-based). */
  start: number;
  /** Last device number, `null` when open-ended. */
  end: number | null;
}

export function tierRanges(tiers: readonly TierLike[]): TierRange[] {
  let prevEnd = 0;
  return tiers.map((t) => {
    const start = prevEnd + 1;
    if (t.endQty !== null) prevEnd = t.endQty;
    return { start, end: t.endQty };
  });
}

export interface TierRow {
  index: number;
  name: string;
  start: number;
  end: number | null;
  rate: number;
  /** Devices of this agent that fall inside this tier. */
  count: number;
  /** count × rate. */
  reward: number;
  /** Tier is finished (finite end reached). */
  complete: boolean;
  open: boolean;
  /** Reward that can be paid now: finished tiers, plus devices of the open last tier. */
  payable: number;
  /** Reward of this tier that is accruing but not yet payable (a finite tier still in progress). */
  accruing: number;
  /** Full reward of the tier when completed; `null` for the open tier. */
  blockReward: number | null;
}

export interface RewardBreakdown {
  validSales: number;
  rows: TierRow[];
  totalReward: number;
  payable: number;
  accruing: number;
}

/**
 * Core rule: total = Σ (devices that fall inside the tier × that tier's rate).
 * Every device is counted in exactly one tier. Lower tiers are never re-priced.
 * The caller must pass calculable tiers (see `isCalculable`).
 */
export function rewardBreakdown(tiers: readonly TierLike[], validSales: number): RewardBreakdown {
  const n = Math.max(0, Math.floor(validSales));
  const ranges = tierRanges(tiers);
  const rows: TierRow[] = tiers.map((t, i) => {
    const { start, end } = ranges[i];
    const rate = t.rate ?? 0;
    const upper = end === null ? n : Math.min(n, end);
    const count = Math.max(0, upper - (start - 1));
    const reward = count * rate;
    const open = end === null;
    const complete = end !== null && n >= end;
    return {
      index: i,
      name: t.name,
      start,
      end,
      rate,
      count,
      reward,
      complete,
      open,
      payable: complete || open ? reward : 0,
      accruing: !complete && !open ? reward : 0,
      blockReward: end === null ? null : (end - start + 1) * rate,
    };
  });
  return {
    validSales: n,
    rows,
    totalReward: rows.reduce((s, r) => s + r.reward, 0),
    payable: rows.reduce((s, r) => s + r.payable, 0),
    accruing: rows.reduce((s, r) => s + r.accruing, 0),
  };
}

export interface Progress {
  validSales: number;
  /** Tier of the last counted device; -1 before the first sale. */
  levelIndex: number;
  /** Tier that the next device will fall into (the block being filled). */
  blockIndex: number;
  /** Devices still needed to complete the current block; `null` for the open tier. */
  remainingToBlock: number | null;
  /** Index of the next level, `null` at the top. */
  nextLevelIndex: number | null;
  /** Devices needed to enter the next level (its first device). */
  toNextLevel: number | null;
  blockReward: number | null;
  blockRate: number;
  /** Set when sales sit exactly on a finite tier boundary. */
  justCompletedIndex: number | null;
  atTopLevel: boolean;
}

export function progressFor(tiers: readonly TierLike[], validSales: number): Progress {
  const n = Math.max(0, Math.floor(validSales));
  const ranges = tierRanges(tiers);
  const last = tiers.length - 1;
  let blockIndex = ranges.findIndex((r) => r.end === null || n < r.end);
  if (blockIndex < 0) blockIndex = last;
  let levelIndex = -1;
  if (n > 0) {
    levelIndex = ranges.findIndex((r) => r.end === null || n <= r.end);
    if (levelIndex < 0) levelIndex = last;
  }
  const block = ranges[blockIndex];
  const nextLevelIndex = levelIndex + 1 <= last ? levelIndex + 1 : null;
  const justCompletedIndex =
    n > 0 && ranges[levelIndex].end !== null && n === ranges[levelIndex].end ? levelIndex : null;
  return {
    validSales: n,
    levelIndex,
    blockIndex,
    remainingToBlock: block.end === null ? null : block.end - n,
    nextLevelIndex,
    toNextLevel: nextLevelIndex === null ? null : ranges[nextLevelIndex].start - n,
    blockReward: block.end === null ? null : (block.end - block.start + 1) * (tiers[blockIndex].rate ?? 0),
    blockRate: tiers[blockIndex].rate ?? 0,
    justCompletedIndex,
    atTopLevel: levelIndex === last,
  };
}

/** Normalises editor tiers (e.g. ids) without changing numbers. */
export function normalizeTiers(tiers: readonly TierInput[], makeId: () => string): Tier[] {
  return tiers.map((t) => ({
    id: t.id || makeId(),
    name: t.name.trim(),
    endQty: t.endQty,
    rate: t.rate,
  }));
}
