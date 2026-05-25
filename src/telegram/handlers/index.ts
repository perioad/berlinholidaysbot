import type { Bot } from 'grammy';

import type { HandlerDependencies } from '../dependencies';
import { createChatMemberHandler } from './chat-member.handler';
import { createMessageHandler } from './message.handler';
import { createStartHandler } from './start.handler';

/**
 * Wires every handler into the given bot. Adding a new command/event is a
 * matter of:
 *   1. Writing `src/telegram/handlers/<name>.handler.ts` with a factory.
 *   2. Calling `bot.on(...) / bot.command(...)` here.
 */
export function registerHandlers(bot: Bot, deps: HandlerDependencies): void {
  bot.command('start', createStartHandler(deps));
  bot.on('my_chat_member', createChatMemberHandler(deps));
  bot.on('message:text', createMessageHandler(deps));
}
