import type { AdminNotifier } from '../core/admin/admin-notifier';
import type { UsersRepository } from '../core/database/users-repository';
import type { BotUser, TelegramUserSnapshot } from '../core/domain/user';
import type { Logger } from '../core/logger/logger';

/**
 * Everything a handler or middleware might need, bundled into one object so
 * each handler signature stays narrow and tests don't have to mock the whole
 * world.
 *
 * To add a new dependency (e.g. a `JokesRepository`), extend this type, inject
 * it once in the Lambda entrypoint, and only the handlers that need it pull it
 * out. No global state, no service locator.
 */
export type HandlerDependencies = {
  users: UsersRepository;
  adminNotifier: AdminNotifier;
  logger: Logger;
  buildUser: (snapshot: TelegramUserSnapshot) => BotUser;
};
