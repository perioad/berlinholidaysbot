import type { Context, Filter } from 'grammy';

import type { HandlerDependencies } from '../dependencies';
import { Messages } from '../messages';
import { notifyAdmin } from '../notifications';

/**
 * Any text message that is *not* a recognised command - replies with the
 * "chat not supported" notice and forwards the user message to the admin
 * channel so the operator still sees the feedback. Commands like /start
 * are matched earlier in the chain and do not fall through.
 */
export function createMessageHandler(deps: HandlerDependencies) {
  return async (ctx: Filter<Context, 'message:text'>): Promise<void> => {
    deps.logger.debug('non-command text received', {
      userId: ctx.from?.id,
      text: ctx.message.text,
    });

    await notifyAdmin(deps.adminNotifier, {
      kind: 'user-message',
      user: ctx.from,
      text: ctx.message.text,
    });

    await ctx.reply(Messages.ChatNotSupported);
  };
}
