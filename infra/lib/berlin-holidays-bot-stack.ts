import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { AppConfig } from '../../config/app.config';
import { UsersTable } from './constructs/users-table.construct';
import { WebhookLambda } from './constructs/webhook-lambda.construct';
import { WebhookRegistrar } from './constructs/webhook-registrar.construct';

export type BerlinHolidaysBotStackProps = StackProps & {
  config: AppConfig;
  botToken: string;
  logsBotToken: string;
  logsChatId: string;
  /** debug | info | warn | error. */
  logLevel?: string;
};

/**
 * Top-level stack. Composes the three single-concern constructs:
 *
 *   UsersTable + WebhookLambda (Function URL) + WebhookRegistrar
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
      botToken: props.botToken,
      logsBotToken: props.logsBotToken,
      logsChatId: props.logsChatId,
      telegramWebhookSecret: config.telegram.webhookSecretToken,
      logLevel: props.logLevel ?? 'info',
    });

    new WebhookRegistrar(this, 'WebhookRegistrar', {
      botToken: props.botToken,
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
