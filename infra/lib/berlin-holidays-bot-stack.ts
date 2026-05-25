import { CfnOutput, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { AppConfig } from '../../config/app.config';
import { UsersTable } from './constructs/users-table.construct';
import { WebhookLambda } from './constructs/webhook-lambda.construct';
import { WebhookRegistrar } from './constructs/webhook-registrar.construct';

export type BerlinHolidaysBotStackProps = StackProps & {
  config: AppConfig;
  /** debug | info | warn | error. */
  logLevel?: string;
};

/**
 * Top-level stack. Composes the three single-concern constructs:
 *
 *   UsersTable + WebhookLambda (Function URL) + WebhookRegistrar
 *
 * Token values come from SSM SecureString parameters via dynamic references
 * (see `appConfig.ssm`). `SecretValue.ssmSecure(name)` produces a token
 * that synthesizes to `{{resolve:ssm-secure:NAME}}` (latest version) -
 * CloudFormation resolves it server-side at deploy time when populating
 * each Lambda's env vars.
 *
 * `unsafeUnwrap()` is the explicit way to hand a SecretValue to APIs that
 * type their inputs as plain strings (Lambda env vars do). It does not
 * leak anything at synth time - the underlying value is still just the
 * dynamic reference string.
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

    const botToken = SecretValue.ssmSecure(config.ssm.botTokenName).unsafeUnwrap();
    const logsBotToken = SecretValue.ssmSecure(
      config.ssm.logsBotTokenName,
    ).unsafeUnwrap();
    const logsChatId = SecretValue.ssmSecure(
      config.ssm.logsChatIdName,
    ).unsafeUnwrap();

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
      botToken,
      logsBotToken,
      logsChatId,
      telegramWebhookSecret: config.telegram.webhookSecretToken,
      logLevel: props.logLevel ?? 'info',
    });

    new WebhookRegistrar(this, 'WebhookRegistrar', {
      botToken,
      webhookUrl: webhookLambda.url,
      secretToken: config.telegram.webhookSecretToken,
    });

    new CfnOutput(this, 'WebhookUrl', {
      value: webhookLambda.url,
      description: 'URL Telegram POSTs updates to.',
    });

    new CfnOutput(this, 'UsersTableName', {
      value: usersTable.table.tableName,
      description: 'DynamoDB users table name.',
    });
  }
}
