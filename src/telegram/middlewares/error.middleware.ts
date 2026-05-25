import type { Context, MiddlewareFn } from 'grammy';

import {
  formatError,
  type AdminNotifier,
} from '../../core/admin/admin-notifier';
import type { Logger } from '../../core/logger/logger';

export type ErrorMiddlewareOptions = {
  adminNotifier: AdminNotifier;
  logger: Logger;
};

/**
 * Catches anything thrown downstream, forwards a formatted summary to the
 * `AdminNotifier`, and swallows the error so the Lambda returns 200 to
 * Telegram (otherwise Telegram retries aggressively).
 */
export function createErrorMiddleware(
  options: ErrorMiddlewareOptions,
): MiddlewareFn<Context> {
  const { adminNotifier, logger } = options;

  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const contextDescription = describeContext(ctx);

      logger.error('unhandled error in update', {
        contextDescription,
        error,
      });

      await adminNotifier.notify(
        `[ERROR ${contextDescription}]\n${formatError(error)}`,
      );
    }
  };
}

function describeContext(ctx: Context): string {
  const updateType = Object.keys(ctx.update).filter(k => k !== 'update_id')[0];
  return `update#${ctx.update.update_id}:${updateType ?? 'unknown'}`;
}
