import type { AdminNotifier } from '../core/admin/admin-notifier';
import { keepBerlin } from '../core/holidays/berlin-filter';
import {
  pickAnnualReminder,
  pickThresholdReminder,
} from '../core/holidays/bucketize';
import type { Holiday } from '../core/holidays/types';
import type { Logger } from '../core/logger/logger';
import {
  formatHolidayList,
  formatHolidayReminder,
} from './holiday-messages';
import type { UserBroadcaster } from './user-broadcaster';
import type { UsersRepository } from '../core/database/users-repository';

export type RunDailyHolidayCheckDeps = {
  users: UsersRepository;
  adminNotifier: AdminNotifier;
  broadcaster: UserBroadcaster;
  logger: Logger;
  fetchHolidays: (year: number) => Promise<Holiday[]>;
  /** Injection point for tests so we can freeze the clock. */
  now: () => Date;
};

/**
 * Single daily entrypoint for the cron Lambda:
 *
 *   1. Fetch this year + next year of German holidays from Nager.
 *   2. Filter to Berlin (federal + DE-BE).
 *   3. Decide whether today triggers (a) the Jan 3 annual broadcast,
 *      (b) a 30/7/3/1-day threshold reminder, or both.
 *   4. If nothing fires, ping the admin with a "no match" line and exit.
 *   5. Otherwise list active users once and broadcast each fired bucket,
 *      with one admin summary per broadcast.
 *
 * Per-recipient failures are absorbed by the broadcaster so a few blocked
 * users don't stop the run. The summaries always include `sent/total`.
 */
export async function runDailyHolidayCheck(
  deps: RunDailyHolidayCheckDeps,
): Promise<void> {
  const today = deps.now();
  const year = today.getUTCFullYear();

  let berlin: Holiday[];
  try {
    const [thisYear, nextYear] = await Promise.all([
      deps.fetchHolidays(year),
      deps.fetchHolidays(year + 1),
    ]);
    berlin = keepBerlin([...thisYear, ...nextYear]);
  } catch (error) {
    deps.logger.error('failed to fetch holidays for cron', { error });
    await deps.adminNotifier.notify(
      `Cron: ${iso(today)} aborted - holiday fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  const annual = pickAnnualReminder(berlin, today);
  const threshold = pickThresholdReminder(berlin, today);

  if (!annual && !threshold) {
    deps.logger.info('cron: nothing to broadcast', { today: iso(today) });
    await deps.adminNotifier.notify(`Cron: ${iso(today)} no match`);
    return;
  }

  const users = await deps.users.listActive();
  deps.logger.info('cron: listing active users', {
    total: users.length,
    annual: Boolean(annual),
    threshold: Boolean(threshold),
  });

  if (annual) {
    const text = formatHolidayList({
      title: `Berlin public holidays in ${annual.year}:`,
      holidays: annual.holidays,
    });
    const result = await deps.broadcaster.broadcast(text, users);
    await deps.adminNotifier.notify(
      `Cron: ${iso(today)} annual ${annual.year} sent=${result.sent}/${users.length}` +
        ` failed=${result.failed} deactivated=${result.deactivated}`,
    );
  }

  if (threshold) {
    const text = formatHolidayReminder(
      threshold.bucket,
      threshold.holiday,
      threshold.bridge,
    );
    const result = await deps.broadcaster.broadcast(text, users);
    await deps.adminNotifier.notify(
      `Cron: ${iso(today)} bucket=${threshold.bucket}` +
        ` holiday=${threshold.holiday.localName}` +
        ` sent=${result.sent}/${users.length}` +
        ` failed=${result.failed} deactivated=${result.deactivated}`,
    );
  }
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
