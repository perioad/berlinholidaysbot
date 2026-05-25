import { webhookCallback } from 'grammy';
import type {
  LambdaFunctionURLEvent,
  LambdaFunctionURLHandler,
  LambdaFunctionURLResult,
} from 'aws-lambda';

import { createTelegramAdminNotifier } from '../../src/core/admin/telegram-admin-notifier';
import { parseEnv } from '../../src/core/config/env';
import { fetchSecrets } from '../../src/core/config/secrets';
import { createDynamoUsersRepository } from '../../src/core/database/dynamo-users-repository';
import { buildNewUser } from '../../src/core/domain/user';
import { createLogger } from '../../src/core/logger/logger';
import { createBot } from '../../src/telegram/bot-factory';

/**
 * Lambda entrypoint.
 *
 * Secrets are fetched from SSM Parameter Store at cold start because
 * CloudFormation does not support `{{resolve:ssm-secure:...}}` dynamic
 * references in Lambda env vars (see `src/core/config/secrets.ts`).
 *
 * The init runs once per warm container and is cached in
 * `cachedHandlerPromise` - both cold and warm invocations await the same
 * promise, so two near-simultaneous cold-start invocations share one
 * `GetParameters` round-trip instead of doing it twice.
 *
 * The Lambda is fronted by a Function URL. Function URLs deliver events
 * in the same payload v2 shape as HTTP API, which grammy's
 * `aws-lambda-async` adapter handles transparently.
 */
type WebhookHandler = (
  event: LambdaFunctionURLEvent,
) => Promise<LambdaFunctionURLResult>;

let cachedHandlerPromise: Promise<WebhookHandler> | null = null;

async function buildHandler(): Promise<WebhookHandler> {
  const env = parseEnv();
  const logger = createLogger({ level: env.LOG_LEVEL });

  const secrets = await fetchSecrets({
    botTokenName: env.BOT_TOKEN_PARAM_NAME,
    logsBotTokenName: env.LOGS_BOT_TOKEN_PARAM_NAME,
    logsChatIdName: env.LOGS_CHAT_ID_PARAM_NAME,
    region: env.AWS_REGION,
  });

  const users = createDynamoUsersRepository({
    tableName: env.USERS_TABLE_NAME,
  });

  const adminNotifier = createTelegramAdminNotifier({
    token: secrets.logsBotToken,
    chatId: secrets.logsChatId,
    logger,
  });

  const bot = createBot({
    token: secrets.botToken,
    deps: {
      users,
      adminNotifier,
      logger,
      buildUser: buildNewUser,
    },
  });

  return webhookCallback(bot, 'aws-lambda-async', {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET,
  }) as unknown as WebhookHandler;
}

export const handler: LambdaFunctionURLHandler = async (event, _context) => {
  if (!cachedHandlerPromise) {
    cachedHandlerPromise = buildHandler().catch(error => {
      // Don't pin a failed init - next invocation should retry.
      cachedHandlerPromise = null;
      throw error;
    });
  }
  const inner = await cachedHandlerPromise;
  return inner(event);
};
