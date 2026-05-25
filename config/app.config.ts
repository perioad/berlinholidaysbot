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

/**
 * Names of the SSM SecureString parameters that hold the bot's secrets.
 *
 * The CDK stack reads them through `SecretValue.ssmSecure(name)`, which
 * synthesizes to `{{resolve:ssm-secure:NAME}}` (no version suffix) - so
 * CloudFormation always resolves the **latest** value at deploy time.
 * Rotation is then just: update the value in SSM via the provisioning
 * script, then `npm run deploy`. No code change needed.
 */
export type SsmConfig = {
  botTokenName: string;
  logsBotTokenName: string;
  logsChatIdName: string;
};

export type AppConfig = {
  stackName: string;
  lambda: LambdaConfig;
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
