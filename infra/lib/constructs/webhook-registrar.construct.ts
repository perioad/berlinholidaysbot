import * as path from 'node:path';

import { CustomResource, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export type WebhookRegistrarProps = {
  /** SSM parameter name (not value) for the main bot token. */
  botTokenParamName: string;
  webhookUrl: string;
  /** Optional Telegram webhook secret (plain string from app config). */
  secretToken?: string;
};

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Lambda-backed Custom Resource that calls Telegram `setWebhook` on stack
 * create/update and `deleteWebhook` on stack delete.
 *
 * After `cdk deploy`, the bot is live: no curl, no manual step.
 *
 * The bot token is read from SSM by the handler itself at invocation
 * time. Only the parameter NAME (not the value) is passed via env var, so
 * the synthesized CloudFormation template stays free of secrets.
 */
export class WebhookRegistrar extends Construct {
  constructor(scope: Construct, id: string, props: WebhookRegistrarProps) {
    super(scope, id);

    const handlerLogGroup = new LogGroup(this, 'HandlerLogGroup', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const onEventHandler = new NodejsFunction(this, 'Handler', {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      logGroup: handlerLogGroup,
      entry: path.join(
        PROJECT_ROOT,
        'lambdas',
        'webhook-registrar',
        'index.ts',
      ),
      handler: 'handler',
      depsLockFilePath: path.join(PROJECT_ROOT, 'package-lock.json'),
      bundling: {
        target: 'node20',
        format: OutputFormat.CJS,
        minify: true,
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        BOT_TOKEN_PARAM_NAME: props.botTokenParamName,
        ...(props.secretToken ? { SECRET_TOKEN: props.secretToken } : {}),
      },
    });

    const { region, account } = Stack.of(this);
    onEventHandler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${region}:${account}:parameter${props.botTokenParamName}`,
        ],
      }),
    );
    onEventHandler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `ssm.${region}.amazonaws.com`,
          },
        },
      }),
    );

    // `Provider` itself has no `logGroup` prop yet and its `logRetention` is
    // the property AWS deprecated. Leaving it unset lets the framework lambda
    // create its log group with the default (never expire) - it runs only on
    // deploys and writes a handful of lines, so cost is effectively zero.
    const provider = new Provider(this, 'Provider', {
      onEventHandler,
    });

    new CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: {
        WebhookUrl: props.webhookUrl,
        // Forces CFN to re-run the Update path on every deploy even if
        // nothing else changed, so the webhook stays registered.
        DeployTimestamp: new Date().toISOString(),
      },
    });
  }
}
