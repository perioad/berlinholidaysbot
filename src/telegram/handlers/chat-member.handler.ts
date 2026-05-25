import type { Context, Filter } from 'grammy';

import type { HandlerDependencies } from '../dependencies';

const INACTIVE_STATUSES = new Set(['kicked', 'left']);

/**
 * Fired when the bot's membership in a chat changes. When the user blocks the
 * bot Telegram delivers `my_chat_member` with status `kicked`, which is our
 * signal to mark them inactive in the DB and notify the admin.
 */
export function createChatMemberHandler(deps: HandlerDependencies) {
  return async (ctx: Filter<Context, 'my_chat_member'>): Promise<void> => {
    const newStatus = ctx.myChatMember.new_chat_member.status;

    if (!INACTIVE_STATUSES.has(newStatus)) {
      return;
    }

    const chatId = String(ctx.chat.id);

    await deps.users.deactivate(chatId);

    deps.logger.info('user deactivated', {
      chatId,
      newStatus,
    });

    await deps.adminNotifier.notify(
      `User left (${newStatus}): ${JSON.stringify(ctx.from ?? { id: chatId })}`,
    );
  };
}
