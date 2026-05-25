import type { Context, MiddlewareFn } from 'grammy';

import type { Logger } from '../../core/logger/logger';

/**
 * Logs every incoming update once on entry and once on exit, with the duration
 * attached. Anything thrown by downstream middlewares propagates up so the
 * error middleware can handle it.
 */
export function createLoggingMiddleware(logger: Logger): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const start = Date.now();
    const requestLogger = logger.child({
      updateId: ctx.update.update_id,
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
    });

    requestLogger.info('telegram update received', {
      update: ctx.update,
    });

    try {
      await next();
    } finally {
      requestLogger.info('telegram update handled', {
        durationMs: Date.now() - start,
      });
    }
  };
}
