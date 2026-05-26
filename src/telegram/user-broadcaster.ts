import type { Bot } from 'grammy';

import type { UsersRepository } from '../core/database/users-repository';
import type { BotUser } from '../core/domain/user';
import type { Logger } from '../core/logger/logger';
import { sleep as defaultSleep } from '../core/util/sleep';

const DEFAULT_DELAY_MS = 200;
const BLOCKED_BY_USER = 403;

export type BroadcastResult = {
  sent: number;
  failed: number;
  deactivated: number;
};

export type UserBroadcaster = {
  broadcast(text: string, recipients: BotUser[]): Promise<BroadcastResult>;
};

export type CreateUserBroadcasterOptions = {
  bot: Bot;
  users: UsersRepository;
  logger: Logger;
  /** Milliseconds to wait between sends. Default 200ms (~5 msg/sec). */
  delayMs?: number;
  /** Injection point for tests so we don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Sends the same message to a list of users sequentially, pacing the
 * outbound calls to stay under Telegram's ~30 msg/sec broadcast limit.
 *
 * Messages go out with `parse_mode: 'HTML'` and link previews disabled -
 * the cron formats its text via `holiday-messages.ts` which emits HTML
 * with a Wikipedia link in it, and we don't want the preview card
 * inflating every message. If a future caller needs plain text, the
 * formatter just shouldn't include any tags - escaped HTML renders fine
 * as plain content.
 *
 * Per-recipient errors never throw out of `broadcast`:
 *   - HTTP 403 ("bot was blocked by the user") -> deactivate the user
 *     and continue. Telegram already tells us via `my_chat_member` when
 *     this happens, but this catches the cases where that signal was
 *     missed (e.g. the bot was blocked while inactive).
 *   - Any other failure is logged and the loop moves on. The summary
 *     return value carries the counts so the caller can include them in
 *     an admin notification.
 */
export function createUserBroadcaster(
  options: CreateUserBroadcasterOptions,
): UserBroadcaster {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async broadcast(text, recipients) {
      let sent = 0;
      let failed = 0;
      let deactivated = 0;

      for (let i = 0; i < recipients.length; i++) {
        const user = recipients[i]!;
        try {
          await options.bot.api.sendMessage(user.id, text, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          });
          sent++;
        } catch (error) {
          failed++;
          if (isBlockedError(error)) {
            try {
              await options.users.deactivate(user.id);
              deactivated++;
            } catch (deactivateError) {
              options.logger.error(
                'failed to deactivate user after Telegram 403',
                { userId: user.id, error: deactivateError },
              );
            }
          } else {
            options.logger.error('failed to broadcast to user', {
              userId: user.id,
              error,
            });
          }
        }

        if (i < recipients.length - 1) {
          await sleep(delayMs);
        }
      }

      return { sent, failed, deactivated };
    },
  };
}

/**
 * grammy throws `GrammyError` for Telegram API failures with an
 * `error_code` matching the HTTP status. We duck-type rather than
 * `instanceof`-check so any structurally-compatible test double works
 * (the production code doesn't care about the class identity, just the
 * code).
 */
function isBlockedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error_code' in error &&
    (error as { error_code: unknown }).error_code === BLOCKED_BY_USER
  );
}
