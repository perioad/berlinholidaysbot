import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { AppConfig } from '../../config/app.config';
import { CronLambda } from './constructs/cron-lambda.construct';
import { UsersTable } from './constructs/users-table.construct';
import { WebhookLambda } from './constructs/webhook-lambda.construct';

export type BerlinHolidaysBotStackProps = StackProps & {
  config: AppConfig;
  /** debug | info | warn | error. */
  logLevel?: string;
};

/**
 * Top-level stack. Composes two single-concern constructs:
 *
 *   UsersTable + WebhookLambda (with Function URL)
 *
 * Webhook registration with Telegram is intentionally NOT automated by the
 * stack: it's a one-shot operation (the Function URL is stable across
 * deploys unless the Lambda itself is deleted), so we kept it manual to
 * avoid carrying around two extra Lambdas (custom-resource handler +
 * CDK Provider framework) for a job that runs once a year. See AGENTS.md
 * > "Webhook registration" for the curl commands.
 *
 * Secrets are NOT passed into the stack as values - only the SSM
 * parameter NAMES are. The Lambda reads its own secrets at cold start
 * via `fetchSecrets()` (see `src/core/config/secrets.ts`). This sidesteps
 * the CloudFormation limitation that `{{resolve:ssm-secure:...}}` dynamic
 * references are not supported in `AWS::Lambda::Function.Environment`.
 *
 * Adding a new lambda (e.g. cron, batch) is a matter of creating one more
 * construct and wiring it here - everything else stays untouched.
 */
export class BerlinHolidaysBotStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: BerlinHolidaysBotStackProps,
  ) {
    super(scope, id, props);

    const { config } = props;

    const usersTable = new UsersTable(this, 'UsersTable', {
      tableName: config.dynamodb.usersTableName,
      retainOnDelete: false,
    });

    const webhookLambda = new WebhookLambda(this, 'WebhookLambda', {
      functionName: config.lambda.functionName,
      memoryMb: config.lambda.memoryMb,
      timeoutSec: config.lambda.timeoutSec,
      logRetentionDays: config.lambda.logRetentionDays,
      usersTable: usersTable.table,
      botTokenParamName: config.ssm.botTokenName,
      logsBotTokenParamName: config.ssm.logsBotTokenName,
      logsChatIdParamName: config.ssm.logsChatIdName,
      telegramWebhookSecret: config.telegram.webhookSecretToken,
      logLevel: props.logLevel ?? 'info',
    });

    const cronLambda = new CronLambda(this, 'CronLambda', {
      functionName: config.cron.functionName,
      memoryMb: config.cron.memoryMb,
      timeoutSec: config.cron.timeoutSec,
      logRetentionDays: config.cron.logRetentionDays,
      scheduleExpression: config.cron.scheduleExpression,
      usersTable: usersTable.table,
      botTokenParamName: config.ssm.botTokenName,
      logsBotTokenParamName: config.ssm.logsBotTokenName,
      logsChatIdParamName: config.ssm.logsChatIdName,
      logLevel: props.logLevel ?? 'info',
    });

    new CfnOutput(this, 'WebhookUrl', {
      value: webhookLambda.url,
      description:
        'URL Telegram POSTs updates to. After first deploy, register it ' +
        'with Telegram via the curl in AGENTS.md > Webhook registration.',
    });

    new CfnOutput(this, 'CronFunctionName', {
      value: cronLambda.function.functionName,
      description:
        'Daily holiday-reminder Lambda. Triggered by EventBridge schedule ' +
        `${config.cron.scheduleExpression}.`,
    });

    new CfnOutput(this, 'UsersTableName', {
      value: usersTable.table.tableName,
      description: 'DynamoDB users table name.',
    });
  }
}
