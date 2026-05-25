import { Bot } from 'grammy';

import type { Logger } from '../logger/logger';
import { formatError, type AdminNotifier } from './admin-notifier';

/**
 * Telegram has a 4096-char limit per message. We leave a small safety margin
 * for the "...trimmed" suffix.
 */
const MAX_MESSAGE_LENGTH = 4000;

export type TelegramAdminNotifierOptions = {
  token: string;
  chatId: string;
  /** Pre-built grammy Bot - injected in tests. */
  bot?: Bot;
  /** Optional logger so we can record send failures locally. */
  logger?: Pick<Logger, 'error'>;
};

/**
 * Sends operator messages to a dedicated Telegram "logs" bot.
 *
 * Why grammy (instead of raw fetch)? Per the project rule "always use a
 * package instead of directly calling APIs". grammy gives us retry/throttle
 * hooks and typed responses for free.
 *
 * Delivery failures are swallowed: an admin notification failing must never
 * crash the main bot loop or cause Telegram to retry the underlying update.
 */
export function createTelegramAdminNotifier(
  options: TelegramAdminNotifierOptions,
): AdminNotifier {
  const bot = options.bot ?? new Bot(options.token);
  const { chatId, logger } = options;

  return {
    async notify(message) {
      const text =
        message.length > MAX_MESSAGE_LENGTH
          ? `${message.slice(0, MAX_MESSAGE_LENGTH - 3)}...`
          : message;

      try {
        await bot.api.sendMessage(chatId, text);
      } catch (sendError) {
        logger?.error('Failed to deliver admin notification', {
          sendError: formatError(sendError),
        });
      }
    },
  };
}
