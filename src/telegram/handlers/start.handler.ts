import type { CommandContext, Context } from 'grammy';

import { upsertOnStart } from '../../core/database/users-repository';
import type { HandlerDependencies } from '../dependencies';
import { Messages } from '../messages';
import { notifyAdmin } from '../notifications';

/**
 * /start - creates the user (or reactivates them) and replies with the
 * welcome greeting, or tells an already-active user they are subscribed.
 * Every invocation is reported to the admin channel so the operator sees
 * all command activity.
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
  };
}
