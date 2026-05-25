import { webhookCallback } from 'grammy';
import type { LambdaFunctionURLHandler } from 'aws-lambda';

import { createTelegramAdminNotifier } from '../../src/core/admin/telegram-admin-notifier';
import { parseEnv } from '../../src/core/config/env';
import { createDynamoUsersRepository } from '../../src/core/database/dynamo-users-repository';
import { buildNewUser } from '../../src/core/domain/user';
import { createLogger } from '../../src/core/logger/logger';
import { createBot } from '../../src/telegram/bot-factory';

/**
 * Cold-start bootstrap. All side-effecting construction happens once per
 * container so warm invocations skip env parsing, client creation, etc.
 *
 * The Lambda is fronted by a Function URL (not API Gateway). Function URLs
 * deliver events in the same payload v2 shape as HTTP API, which grammy's
 * `aws-lambda-async` adapter handles transparently.
 */
function bootstrap(): LambdaFunctionURLHandler {
  const env = parseEnv();
  const logger = createLogger({ level: env.LOG_LEVEL });

  const users = createDynamoUsersRepository({
    tableName: env.USERS_TABLE_NAME,
  });

  const adminNotifier = createTelegramAdminNotifier({
    token: env.LOGS_BOT_TOKEN,
    chatId: env.LOGS_CHAT_ID,
    logger,
  });

  const bot = createBot({
    token: env.BOT_TOKEN,
    deps: {
      users,
      adminNotifier,
      logger,
      buildUser: buildNewUser,
    },
  });

  return webhookCallback(bot, 'aws-lambda-async', {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET,
  }) as unknown as LambdaFunctionURLHandler;
}

export const handler: LambdaFunctionURLHandler = bootstrap();
