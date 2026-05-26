import * as path from 'node:path';

import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { grantSsmSecureRead } from '../iam/ssm-secure-read';
import { mapLogRetention } from '../util/log-retention';

export type CronLambdaProps = {
  functionName: string;
  memoryMb: number;
  /** Lambda execution timeout in seconds. ~300 leaves headroom for ~750 users. */
  timeoutSec: number;
  logRetentionDays: number;
  /** EventBridge cron expression, e.g. `cron(0 10 * * ? *)` for daily 10:00 UTC. */
  scheduleExpression: string;
  usersTable: Table;
  botTokenParamName: string;
  logsBotTokenParamName: string;
  logsChatIdParamName: string;
  logLevel: string;
};

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Daily holiday-reminder Lambda triggered by an EventBridge schedule.
 *
 * Unlike the webhook Lambda there is no Function URL - this function is
 * only ever invoked by EventBridge, so it has no public surface. It
 * shares the webhook Lambda's SSM + DynamoDB grants because it talks to
 * the same Telegram bots and reads the same user table.
 *
 * Memory is kept modest (default 256 MB) since the work is mostly I/O,
 * but the timeout is much higher (default 300s) so the broadcaster can
 * pace through a few hundred users without truncation.
 */
export class CronLambda extends Construct {
  readonly function: NodejsFunction;
  readonly rule: Rule;

  constructor(scope: Construct, id: string, props: CronLambdaProps) {
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
      entry: path.join(PROJECT_ROOT, 'lambdas', 'cron', 'index.ts'),
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
        BOT_TOKEN_PARAM_NAME: props.botTokenParamName,
        LOGS_BOT_TOKEN_PARAM_NAME: props.logsBotTokenParamName,
        LOGS_CHAT_ID_PARAM_NAME: props.logsChatIdParamName,
        USERS_TABLE_NAME: props.usersTable.tableName,
        LOG_LEVEL: props.logLevel,
      },
    });

    props.usersTable.grantReadWriteData(this.function);

    grantSsmSecureRead(this.function, [
      props.botTokenParamName,
      props.logsBotTokenParamName,
      props.logsChatIdParamName,
    ]);

    this.rule = new Rule(this, 'Schedule', {
      schedule: Schedule.expression(props.scheduleExpression),
      targets: [new LambdaFunction(this.function)],
    });
  }
}
