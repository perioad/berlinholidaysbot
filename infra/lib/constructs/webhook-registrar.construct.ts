import * as path from 'node:path';

import { CustomResource, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export type WebhookRegistrarProps = {
  /**
   * SSM dynamic reference (`{{resolve:ssm-secure:...}}`) for the bot token.
   * Wired to the handler Lambda's env var, NOT to the custom resource
   * properties - those land in the synthesized template in plain text and
   * would leak the value to anyone with `cloudformation:GetTemplate`.
   */
  botToken: string;
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
 * Sensitive values (the bot token, the optional secret) travel via the
 * handler Lambda's env vars. The custom resource itself only carries
 * non-sensitive triggers - the webhook URL and a deploy timestamp - so the
 * rendered CloudFormation template stays free of secrets.
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
        BOT_TOKEN: props.botToken,
        ...(props.secretToken ? { SECRET_TOKEN: props.secretToken } : {}),
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
        WebhookUrl: props.webhookUrl,
        // Forces CFN to re-run the Update path on every deploy even if
        // nothing else changed, so the webhook stays registered.
        DeployTimestamp: new Date().toISOString(),
      },
    });
  }
}
