/**
 * Domain representation of a bot user. Persistence-agnostic - the DynamoDB
 * mapping lives in the repository implementation, not here.
 */
export type BotUser = {
  /** Telegram chat/user id, stored as string for DynamoDB key compatibility. */
  id: string;
  isActive: boolean;
  isBot: boolean;
  isPremium: boolean;
  languageCode: string;
  firstName: string;
  lastName: string;
  username: string;
  /** ISO 8601 UTC string of first /start. */
  startDate: string;
  /** ISO 8601 UTC string of most recent deactivation, if any. */
  endDate?: string;
  /** ISO 8601 UTC string of most recent reactivation, if any. */
  reactDate?: string;
};

/**
 * Minimal slice of Telegram's `User` object that we need to build a `BotUser`.
 * Decoupled from grammy types so the domain layer doesn't depend on the
 * Telegram client library.
 */
export type TelegramUserSnapshot = {
  id: number;
  is_bot: boolean;
  is_premium?: boolean;
  language_code?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export function buildNewUser(
  snapshot: TelegramUserSnapshot,
  now: () => Date = () => new Date(),
): BotUser {
  return {
    id: String(snapshot.id),
    isActive: true,
    isBot: snapshot.is_bot,
    isPremium: snapshot.is_premium ?? false,
    languageCode: snapshot.language_code ?? '',
    firstName: snapshot.first_name ?? '',
    lastName: snapshot.last_name ?? '',
    username: snapshot.username ?? '',
    startDate: now().toISOString(),
  };
}
