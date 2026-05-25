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
import { withTimeout } from '../../src/core/util/with-timeout';
import { createBot } from '../../src/telegram/bot-factory';

/**
 * Lambda entrypoint.
 *
 * Secrets are fetched from SSM Parameter Store at cold start because
 * CloudFormation does not support `{{resolve:ssm-secure:...}}` dynamic
 * references in Lambda env vars (see `src/core/config/secrets.ts`).
 *
 * The init runs once per warm container and is cached in
 * `cachedHandlerPromise`. Two near-simultaneous cold-start invocations
 * share the same promise so we only do one SSM round-trip.
 *
 * `bot.init()` and `inner(event)` are guarded by `withTimeout` so a
 * stuck Telegram or DynamoDB call surfaces as a clear error instead of
 * hitting the Lambda's hard timeout with no signal.
 */
type WebhookHandler = (
  event: LambdaFunctionURLEvent,
) => Promise<LambdaFunctionURLResult>;

const BOT_INIT_TIMEOUT_MS = 5000;
const HANDLER_TIMEOUT_MS = 12000;

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

  // Eagerly fetch the bot identity at cold start so the first incoming
  // update doesn't pay the getMe roundtrip, and so outbound-network or
  // token problems fail loudly here instead of inside an update.
  await withTimeout(bot.init(), BOT_INIT_TIMEOUT_MS, 'bot.init');
  logger.info('Bot initialized', {
    id: bot.botInfo.id,
    username: bot.botInfo.username,
  });

  return webhookCallback(bot, 'aws-lambda-async', {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET,
  }) as unknown as WebhookHandler;
}

export const handler: LambdaFunctionURLHandler = async (event, _context) => {
  if (!cachedHandlerPromise) {
    cachedHandlerPromise = buildHandler().catch(error => {
      // Bootstrap failures predate the logger, so fall back to console.
      console.error('Bootstrap failed', error);
      cachedHandlerPromise = null;
      throw error;
    });
  }
  const inner = await cachedHandlerPromise;
  return withTimeout(inner(event), HANDLER_TIMEOUT_MS, 'grammy webhook handler');
};
