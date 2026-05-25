import { Bot } from 'grammy';

import type { HandlerDependencies } from './dependencies';
import { createGrammyBot } from './grammy-bot';
import { registerHandlers } from './handlers';
import { createErrorMiddleware } from './middlewares/error.middleware';
import { createLoggingMiddleware } from './middlewares/logging.middleware';

export type CreateBotOptions = {
  token: string;
  deps: HandlerDependencies;
  /** Inject a pre-built Bot for tests; production passes `token` only. */
  bot?: Bot;
};

/**
 * Builds a fully-configured grammy Bot. The middleware order matters:
 *
 *   logging -> error -> handlers
 *
 * so request/response logging always happens, errors thrown in handlers are
 * caught before reaching grammy's default error boundary, and successful
 * requests pass straight through.
 */
export function createBot(options: CreateBotOptions): Bot {
  const bot = options.bot ?? createGrammyBot(options.token);

  bot.use(createLoggingMiddleware(options.deps.logger));
  bot.use(
    createErrorMiddleware({
      adminNotifier: options.deps.adminNotifier,
      logger: options.deps.logger,
    }),
  );

  registerHandlers(bot, options.deps);

  return bot;
}
