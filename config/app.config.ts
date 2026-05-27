/**
 * Single source of truth for everything deploy-related.
 *
 * Imported both by the CDK app (`infra/bin/app.ts`) and by the Lambda code
 * (for table-name defaults). Editing one field here propagates to the entire
 * stack on the next `cdk deploy`.
 */

export type LambdaConfig = {
  functionName: string;
  memoryMb: number;
  timeoutSec: number;
  logRetentionDays: number;
};

export type CronConfig = LambdaConfig & {
  /**
   * EventBridge cron expression. The `cron(...)` syntax has 6 fields:
   * minute hour day-of-month month day-of-week year. Either `day-of-month`
   * or `day-of-week` must be `?` (mutually exclusive).
   *
   * Default `cron(0 10 * * ? *)` = every day at 10:00 UTC (midday Berlin
   * time year-round, well away from the day boundary in both DST regimes).
   */
  scheduleExpression: string;
};

export type DynamoConfig = {
  usersTableName: string;
};

export type TelegramConfig = {
  /**
   * If set, this value is sent as the `secret_token` when registering the
   * webhook with Telegram, and must match the `X-Telegram-Bot-Api-Secret-Token`
   * header on every incoming request. Strongly recommended for production.
   */
  webhookSecretToken?: string;
};

/**
 * Names of the SSM SecureString parameters that hold the bot's secrets.
 *
 * Only the NAMES travel through the CloudFormation template (as plain
 * Lambda env vars). The Lambda fetches the values itself at cold start
 * via `fetchSecrets()` in `src/core/config/secrets.ts`. CloudFormation
 * does not support `{{resolve:ssm-secure:...}}` dynamic references in
 * Lambda env vars, which is why we resolve at runtime instead of at
 * deploy time.
 *
 * Rotation = update the value in SSM with `npm run secrets:rotate`; the
 * next cold start picks up the new value automatically (no redeploy).
 */
export type SsmConfig = {
  botTokenName: string;
  logsBotTokenName: string;
  logsChatIdName: string;
};

export type AppConfig = {
  stackName: string;
  lambda: LambdaConfig;
  cron: CronConfig;
  dynamodb: DynamoConfig;
  telegram: TelegramConfig;
  ssm: SsmConfig;
};

export const appConfig: AppConfig = {
  stackName: 'BerlinHolidaysBotStack',
  lambda: {
    functionName: 'berlin-holidays-bot-webhook',
    memoryMb: 256,
    timeoutSec: 15,
    logRetentionDays: 30,
  },
  cron: {
    functionName: 'berlin-holidays-bot-cron',
    memoryMb: 256,
    // AWS Lambda hard cap. With the broadcaster at 50ms delay and
    // ~150ms Telegram RTT (~200ms per recipient), this supports
    // roughly 4,000-4,500 active users per run, leaving headroom for
    // cold start, secrets fetch, holiday API call, and the DDB scan.
    timeoutSec: 900,
    logRetentionDays: 30,
    scheduleExpression: 'cron(0 10 * * ? *)',
  },
  dynamodb: {
    usersTableName: 'berlin-holidays-bot-users',
  },
  telegram: {},
  ssm: {
    botTokenName: '/berlinholidaysbot/bot-token',
    logsBotTokenName: '/berlinholidaysbot/logs-bot-token',
    logsChatIdName: '/berlinholidaysbot/logs-chat-id',
  },
};
