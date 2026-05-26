import type { CommandContext, Context } from 'grammy';

import { upsertOnStart } from '../../core/database/users-repository';
import { keepBerlin } from '../../core/holidays/berlin-filter';
import { upcomingFrom } from '../../core/holidays/bucketize';
import type { HandlerDependencies } from '../dependencies';
import {
  formatHolidayList,
  formatTodayHolidayGreeting,
} from '../holiday-messages';
import { Messages } from '../messages';
import { notifyAdmin } from '../notifications';

/**
 * /start - creates the user (or reactivates them) and replies with the
 * welcome greeting, or tells an already-active user they are subscribed.
 * Every invocation is reported to the admin channel so the operator sees
 * all command activity.
 *
 * New and reactivated users additionally receive a second message
 * containing the still-upcoming Berlin holidays for the current year,
 * plus January of next year (so the Dec 25 + Dec 26 + Jan 1 cluster
 * always shows up as a "Bridge day opportunity" no matter when in the
 * year the user signs up, but without trailing 11 more months of
 * next-year holidays for someone joining in January). When today
 * itself is a Berlin public holiday, an additional "Today is X,
 * congrats!" message with a Berlin.de events link is sent in front of
 * the list, and today's entry is dropped from the list to avoid
 * showing the same holiday twice. Already-active users skip both
 * messages - they've seen them before. Fetch failures are caught and
 * reported to admin but never break the welcome.
 */
export function createStartHandler(deps: HandlerDependencies) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    if (!ctx.from) {
      deps.logger.warn('start command without `from`', {
        update: ctx.update,
      });
      return;
    }

    const { status } = await upsertOnStart(
      deps.users,
      {
        id: ctx.from.id,
        is_bot: ctx.from.is_bot,
        is_premium: ctx.from.is_premium,
        language_code: ctx.from.language_code,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
      },
      deps.buildUser,
    );

    deps.logger.info('user start processed', {
      userId: ctx.from.id,
      status,
    });

    if (status === 'new') {
      await notifyAdmin(deps.adminNotifier, {
        kind: 'user-joined',
        user: ctx.from,
      });
    } else if (status === 'reactivated') {
      await notifyAdmin(deps.adminNotifier, {
        kind: 'user-reactivated',
        user: ctx.from,
      });
    } else {
      await notifyAdmin(deps.adminNotifier, {
        kind: 'user-already-active',
        user: ctx.from,
        command: 'start',
      });
    }

    const reply =
      status === 'already-active'
        ? Messages.AlreadyActive
        : status === 'reactivated'
          ? Messages.WelcomeBack
          : Messages.Welcome;

    await ctx.reply(reply);

    if (status === 'new' || status === 'reactivated') {
      await sendUpcomingHolidaysList(ctx, deps);
    }
  };
}

async function sendUpcomingHolidaysList(
  ctx: CommandContext<Context>,
  deps: HandlerDependencies,
): Promise<void> {
  try {
    const today = new Date();
    const year = today.getUTCFullYear();
    const [thisYear, nextYear] = await Promise.all([
      deps.fetchHolidays(year),
      deps.fetchHolidays(year + 1),
    ]);
    // Keep only January of next year - that's enough to keep the
    // Christmas + New Year bridge cluster intact in the welcome list.
    const januaryNextYear = nextYear.filter(h =>
      h.date.startsWith(`${year + 1}-01-`),
    );
    const upcoming = upcomingFrom(
      keepBerlin([...thisYear, ...januaryNextYear]),
      today,
    );
    if (upcoming.length === 0) return;

    const todayIso = today.toISOString().slice(0, 10);
    const todayHoliday =
      upcoming[0]?.date === todayIso ? upcoming[0] : undefined;
    const future = todayHoliday ? upcoming.slice(1) : upcoming;

    if (todayHoliday) {
      await ctx.reply(formatTodayHolidayGreeting(todayHoliday), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    }

    if (future.length === 0) return;

    await ctx.reply(
      formatHolidayList({
        title: 'Upcoming Berlin public holidays:',
        holidays: future,
        today,
      }),
      {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
    );
  } catch (error) {
    deps.logger.error('failed to send welcome holiday list', { error });
    // Best-effort - never let this fail the /start flow. Surface to admin
    // so we know users are missing the list, but don't ping the user.
    try {
      await deps.adminNotifier.notify(
        `Welcome holiday list failed for user ${ctx.from?.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } catch (notifyError) {
      deps.logger.error('failed to notify admin about welcome list failure', {
        error: notifyError,
      });
    }
  }
}
