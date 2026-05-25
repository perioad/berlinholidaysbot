import * as path from 'node:path';

import { CustomResource, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export type WebhookRegistrarProps = {
  botToken: string;
  webhookUrl: string;
  secretToken?: string;
};

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Lambda-backed Custom Resource that calls Telegram `setWebhook` on stack
 * create/update and `deleteWebhook` on stack delete.
 *
 * After `cdk deploy`, the bot is live: no curl, no manual step.
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
    });

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
        BotToken: props.botToken,
        WebhookUrl: props.webhookUrl,
        ...(props.secretToken ? { SecretToken: props.secretToken } : {}),
        // Forces CFN to re-run the Update path on every deploy even if
        // nothing else changed, so the webhook stays registered.
        DeployTimestamp: new Date().toISOString(),
      },
    });
  }
}
