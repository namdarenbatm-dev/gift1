import type { Tier } from './types';
import { formatInt, formatToman } from './numbers';
import { isCalculable, progressFor } from './engine';

export type TickerKind = 'block' | 'level' | 'combo' | 'complete' | 'top';

export interface TickerMessage {
  kind: TickerKind;
  text: string;
}

/**
 * «خط جاری فروش» — the single source of truth for the motivational messages.
 * Both the agent PWA and the admin panel call this function, so the text is identical.
 * Nothing is hard-coded: every number comes from the campaign tiers and the valid sales count.
 * Returns an empty list when the campaign is not fully defined, so no invalid message appears.
 */
export function buildTicker(tiers: readonly Tier[], validSales: number): TickerMessage[] {
  if (!isCalculable(tiers)) return [];
  const p = progressFor(tiers, validSales);
  const out: TickerMessage[] = [];
  const block = tiers[p.blockIndex];
  const level = p.levelIndex >= 0 ? tiers[p.levelIndex] : null;
  const next = p.nextLevelIndex !== null ? tiers[p.nextLevelIndex] : null;

  // پیام چهارم: تکمیل سطح
  if (p.justCompletedIndex !== null) {
    out.push({
      kind: 'complete',
      text: `تبریک! حدنصاب سطح ${tiers[p.justCompletedIndex].name} را تکمیل کردید. پاداش این بازه پس از تأیید فروش‌های معتبر قابل پرداخت است.`,
    });
  }

  // پیام اول: فاصله تا تکمیل بازه‌ی جاری
  if (p.remainingToBlock !== null && p.blockReward !== null) {
    out.push({
      kind: 'block',
      text: `فقط ${formatInt(p.remainingToBlock)} فروش معتبر دیگر تا تکمیل بازه ${block.name} باقی‌مانده است. با تکمیل این بازه، پاداش آن به مبلغ ${formatToman(p.blockReward)} قابل پرداخت خواهد شد.`,
    });
  }

  // پیام دوم: فاصله تا سطح بعدی
  if (next && p.toNextLevel !== null) {
    out.push({
      kind: 'level',
      text: level
        ? `شما در سطح ${level.name} قرار دارید. فقط ${formatInt(p.toNextLevel)} فروش معتبر دیگر تا رسیدن به سطح ${next.name} فاصله دارید.`
        : `هنوز وارد سطحی نشده‌اید. فقط ${formatInt(p.toNextLevel)} فروش معتبر دیگر تا رسیدن به سطح ${next.name} فاصله دارید.`,
    });
  }

  // پیام سوم: ترکیبی (فقط وقتی هر دو فاصله‌ی متفاوت معنادار باشند)
  if (p.remainingToBlock !== null && next && p.toNextLevel !== null && p.toNextLevel !== p.remainingToBlock) {
    out.push({
      kind: 'combo',
      text: `با ${formatInt(p.remainingToBlock)} فروش دیگر، پاداش بازه جاری را تکمیل می‌کنید. برای رسیدن به سطح ${next.name} نیز ${formatInt(p.toNextLevel)} فروش معتبر نیاز دارید.`,
    });
  }

  // پیام پنجم: ورود به سطح نهایی — فقط وقتی سطح نهایی واقعاً حاصل شده باشد
  if (p.atTopLevel && level) {
    out.push({
      kind: 'top',
      text: `تبریک! به سطح ${level.name} رسیدید. نرخ پاداش هر دستگاه جدید در این سطح ${formatToman(level.rate)} است.`,
    });
  }
  return out;
}
