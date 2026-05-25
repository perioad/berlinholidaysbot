import type { Context, Filter } from 'grammy';

import type { HandlerDependencies } from '../dependencies';
import { Messages } from '../messages';

/**
 * Any text message that is *not* a recognised command - replies with the
 * hardcoded greeting and forwards the user message to the admin channel so
 * the operator can see incoming traffic. Commands like /start are matched
 * earlier in the chain and do not fall through.
 */
export function createMessageHandler(deps: HandlerDependencies) {
  return async (ctx: Filter<Context, 'message:text'>): Promise<void> => {
    deps.logger.debug('non-command text received', {
      userId: ctx.from?.id,
      text: ctx.message.text,
    });

    await deps.adminNotifier.notify(
      `User message: ${JSON.stringify(ctx.from)}\n${ctx.message.text}`,
    );

    await ctx.reply(Messages.Reply);
  };
}
