import * as path from 'node:path';

import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { FunctionUrlAuthType, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export type WebhookLambdaProps = {
  functionName: string;
  memoryMb: number;
  timeoutSec: number;
  logRetentionDays: number;
  usersTable: Table;
  /**
   * SSM dynamic reference for the Telegram bot token. The value resolves
   * server-side at deploy time, so the template only carries a pointer.
   */
  botToken: string;
  /** SSM dynamic reference for the separate logs bot token. */
  logsBotToken: string;
  /** SSM dynamic reference for the chat id the logs bot posts to. */
  logsChatId: string;
  /** Optional Telegram webhook secret (plain string from app config). */
  telegramWebhookSecret?: string;
  /** debug | info | warn | error. */
  logLevel: string;
};

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Lambda that serves the Telegram webhook plus its public Function URL.
 *
 * Function URLs give Lambda a direct public HTTPS endpoint - no API Gateway,
 * no $3.50/M request charge, no extra moving part. Auth is `NONE` because
 * Telegram is the only caller and we verify the `secret_token` header inside
 * the handler (see grammy `webhookCallback({ secretToken })`).
 *
 * `@aws-sdk/*` is excluded from the bundle because Lambda's Node 20 runtime
 * ships SDK v3 out of the box.
 */
export class WebhookLambda extends Construct {
  readonly function: NodejsFunction;
  readonly url: string;

  constructor(scope: Construct, id: string, props: WebhookLambdaProps) {
    super(scope, id);

    const logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${props.functionName}`,
      retention: mapLogRetention(props.logRetentionDays),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.function = new NodejsFunction(this, 'Function', {
      functionName: props.functionName,
      runtime: Runtime.NODEJS_20_X,
      memorySize: props.memoryMb,
      timeout: Duration.seconds(props.timeoutSec),
      logGroup,
      tracing: Tracing.ACTIVE,
      entry: path.join(PROJECT_ROOT, 'lambdas', 'webhook', 'index.ts'),
      handler: 'handler',
      depsLockFilePath: path.join(PROJECT_ROOT, 'package-lock.json'),
      bundling: {
        target: 'node20',
        format: OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        BOT_TOKEN: props.botToken,
        LOGS_BOT_TOKEN: props.logsBotToken,
        LOGS_CHAT_ID: props.logsChatId,
        USERS_TABLE_NAME: props.usersTable.tableName,
        LOG_LEVEL: props.logLevel,
        ...(props.telegramWebhookSecret
          ? { TELEGRAM_WEBHOOK_SECRET: props.telegramWebhookSecret }
          : {}),
      },
    });

    props.usersTable.grantReadWriteData(this.function);

    const functionUrl = this.function.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });
    this.url = functionUrl.url;
  }
}

function mapLogRetention(days: number): RetentionDays {
  switch (days) {
    case 1:
      return RetentionDays.ONE_DAY;
    case 3:
      return RetentionDays.THREE_DAYS;
    case 7:
      return RetentionDays.ONE_WEEK;
    case 14:
      return RetentionDays.TWO_WEEKS;
    case 30:
      return RetentionDays.ONE_MONTH;
    case 60:
      return RetentionDays.TWO_MONTHS;
    case 90:
      return RetentionDays.THREE_MONTHS;
    case 180:
      return RetentionDays.SIX_MONTHS;
    case 365:
      return RetentionDays.ONE_YEAR;
    default:
      return RetentionDays.ONE_MONTH;
  }
}
