import type { ScheduledHandler } from 'aws-lambda';

import { createTelegramAdminNotifier } from '../../src/core/admin/telegram-admin-notifier';
import { parseEnv } from '../../src/core/config/env';
import { fetchSecrets } from '../../src/core/config/secrets';
import { createDynamoUsersRepository } from '../../src/core/database/dynamo-users-repository';
import { fetchHolidaysFromNager } from '../../src/core/holidays/nager-client';
import { createLogger } from '../../src/core/logger/logger';
import { withTimeout } from '../../src/core/util/with-timeout';
import { createGrammyBot } from '../../src/telegram/grammy-bot';
import {
  runDailyHolidayCheck,
  type RunDailyHolidayCheckDeps,
} from '../../src/telegram/run-daily';
import { createUserBroadcaster } from '../../src/telegram/user-broadcaster';

/**
 * Daily holiday cron Lambda. Triggered by an EventBridge rule at 10:00
 * UTC (midday Berlin time, far from the day boundary in both DST
 * regimes). The cold-start path mirrors the webhook Lambda:
 *
 *   parseEnv -> createLogger -> fetchSecrets (SSM) -> createDynamoUsers
 *   -> createTelegramAdminNotifier -> createGrammyBot.init -> broadcaster
 *
 * The actual run is `runDailyHolidayCheck` which decides what to send
 * (annual, threshold, both, neither) and reports counts to the admin
 * channel. Both `bot.init` and the run itself are bounded by
 * `withTimeout` so an unhealthy dependency surfaces clearly.
 */

const BOT_INIT_TIMEOUT_MS = 5000;
const RUN_TIMEOUT_MS = 890_000; // < the 900s Lambda timeout, with headroom

let cachedDepsPromise: Promise<RunDailyHolidayCheckDeps> | null = null;

async function buildDeps(): Promise<RunDailyHolidayCheckDeps> {
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

  const bot = createGrammyBot(secrets.botToken);
  await withTimeout(bot.init(), BOT_INIT_TIMEOUT_MS, 'cron bot.init');
  logger.info('Cron bot initialized', {
    id: bot.botInfo.id,
    username: bot.botInfo.username,
  });

  const broadcaster = createUserBroadcaster({
    bot,
    users,
    logger,
  });

  return {
    users,
    adminNotifier,
    broadcaster,
    logger,
    fetchHolidays: fetchHolidaysFromNager,
    now: () => new Date(),
  };
}

export const handler: ScheduledHandler = async () => {
  if (!cachedDepsPromise) {
    cachedDepsPromise = buildDeps().catch(error => {
      console.error('Cron bootstrap failed', error);
      cachedDepsPromise = null;
      throw error;
    });
  }
  const deps = await cachedDepsPromise;
  await withTimeout(
    runDailyHolidayCheck(deps),
    RUN_TIMEOUT_MS,
    'runDailyHolidayCheck',
  );
};
