import type { CommandContext, Context } from 'grammy';

import { upsertOnStart } from '../../core/database/users-repository';
import type { HandlerDependencies } from '../dependencies';
import { Messages } from '../messages';

/**
 * /start - creates the user (or reactivates them) and replies with the
 * hardcoded greeting. New + reactivated users are reported to the admin
 * channel; "already-active" /start hits are intentionally silent to keep
 * noise down for returning chats.
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
      await deps.adminNotifier.notify(
        `New user: ${JSON.stringify(ctx.from)}`,
      );
    } else if (status === 'reactivated') {
      await deps.adminNotifier.notify(
        `User reactivated: ${JSON.stringify(ctx.from)}`,
      );
    }

    await ctx.reply(Messages.Reply);
  };
}
