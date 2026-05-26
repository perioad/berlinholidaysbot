import type { Bucket, BridgeInfo, Holiday } from './types';

const BUCKETS: readonly Bucket[] = [30, 7, 3, 1] as const;
const MS_PER_DAY = 86_400_000;
const BRIDGE_WINDOW_DAYS = 7;
const ANNUAL_MONTH = 0; // January
const ANNUAL_DAY = 3;

export type ThresholdReminder = {
  holiday: Holiday;
  bucket: Bucket;
  bridge?: BridgeInfo;
};

export type AnnualReminder = {
  year: number;
  holidays: Holiday[];
};

/**
 * Returns the upcoming holiday that is *exactly* 30, 7, 3, or 1 day(s)
 * away. We iterate the sorted list forward and stop at the first match;
 * holidays in the past are skipped. If today is not exactly one of these
 * distances from any future holiday, returns `null`.
 *
 * When a match is found and the next Berlin holiday after it is within
 * `BRIDGE_WINDOW_DAYS` days, we also compute the weekdays between them
 * (excluding Sat/Sun) so the caller can prompt the user about bridging
 * vacation days. The bridge info is only attached - the caller decides
 * whether to actually surface it (currently only the 30-day template).
 */
export function pickThresholdReminder(
  berlinHolidays: Holiday[],
  today: Date,
): ThresholdReminder | null {
  const todayUtc = startOfUtcDay(today);

  for (let i = 0; i < berlinHolidays.length; i++) {
    const h = berlinHolidays[i]!;
    const diff = daysBetween(todayUtc, parseUtcDate(h.date));

    if (diff < 0) continue;
    if (!isBucket(diff)) continue;

    const next = berlinHolidays[i + 1];
    const bridge = next ? buildBridge(h, next) : undefined;

    return { holiday: h, bucket: diff, bridge };
  }
  return null;
}

/**
 * Returns the year's holidays iff today is January 3rd (UTC). Used to
 * broadcast the annual overview message once per year. Returns `null`
 * on any other day or if the input has no holidays for the current year.
 */
export function pickAnnualReminder(
  berlinHolidays: Holiday[],
  today: Date,
): AnnualReminder | null {
  if (
    today.getUTCMonth() !== ANNUAL_MONTH ||
    today.getUTCDate() !== ANNUAL_DAY
  ) {
    return null;
  }
  const year = today.getUTCFullYear();
  const holidays = berlinHolidays.filter(h => h.date.startsWith(`${year}-`));
  if (holidays.length === 0) return null;
  return { year, holidays };
}

/**
 * Returns the holidays whose date is today or later, in chronological
 * order. Used by the `/start` handler to greet new users with what's
 * still ahead in the year(s) they were given.
 */
export function upcomingFrom(
  berlinHolidays: Holiday[],
  today: Date,
): Holiday[] {
  const cutoff = toIsoDate(startOfUtcDay(today));
  return berlinHolidays.filter(h => h.date >= cutoff);
}

function buildBridge(h1: Holiday, h2: Holiday): BridgeInfo | undefined {
  const d1 = parseUtcDate(h1.date);
  const d2 = parseUtcDate(h2.date);
  const gap = daysBetween(d1, d2);
  if (gap <= 0 || gap > BRIDGE_WINDOW_DAYS) return undefined;
  return { next: h2, weekdaysBetween: weekdaysBetweenExclusive(d1, d2) };
}

function weekdaysBetweenExclusive(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor < end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      out.push(toIsoDate(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function parseUtcDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(n => Number.parseInt(n, 10));
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isBucket(n: number): n is Bucket {
  return (BUCKETS as readonly number[]).includes(n);
}
