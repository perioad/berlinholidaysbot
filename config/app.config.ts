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

export type AppConfig = {
  stackName: string;
  lambda: LambdaConfig;
  dynamodb: DynamoConfig;
  telegram: TelegramConfig;
};

export const appConfig: AppConfig = {
  stackName: 'BerlinHolidaysBotStack',
  lambda: {
    functionName: 'berlin-holidays-bot-webhook',
    memoryMb: 256,
    timeoutSec: 15,
    logRetentionDays: 30,
  },
  dynamodb: {
    usersTableName: 'berlin-holidays-bot-users',
  },
  telegram: {},
};
