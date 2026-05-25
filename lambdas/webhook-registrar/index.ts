import { Bot } from 'grammy';
import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from 'aws-lambda';

/**
 * CDK Custom Resource handler that registers (and unregisters) the Telegram
 * webhook with the freshly-deployed Function URL.
 *
 * The bot token and optional webhook secret come from the handler's own env
 * vars (sourced from SSM via dynamic references in
 * `webhook-registrar.construct.ts`). They are deliberately NOT passed
 * through `ResourceProperties` because those land in the synthesized
 * CloudFormation template in plain text.
 *
 * Only non-sensitive values travel through the event payload.
 */
type WebhookProperties = {
  WebhookUrl: string;
  /**
   * Bumped by CDK on every deploy so CloudFormation always sees a diff and
   * re-runs the Update path. Without this, identical property values would
   * skip the update and we'd never re-register the URL.
   */
  DeployTimestamp?: string;
};

function getProperties(
  event: CloudFormationCustomResourceEvent,
): WebhookProperties {
  const props = event.ResourceProperties as unknown as WebhookProperties;

  if (!props.WebhookUrl) {
    throw new Error(
      'WebhookRegistrar requires WebhookUrl in ResourceProperties',
    );
  }

  return props;
}

function getBotToken(): string {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    throw new Error(
      'WebhookRegistrar handler missing BOT_TOKEN env var. ' +
        'Did the SSM dynamic reference fail to resolve?',
    );
  }
  return token;
}

export const handler = async (
  event: CloudFormationCustomResourceEvent,
): Promise<CloudFormationCustomResourceResponse> => {
  const props = getProperties(event);
  const bot = new Bot(getBotToken());
  const secretToken = process.env.SECRET_TOKEN;
  const physicalId = `telegram-webhook-${props.WebhookUrl}`;

  try {
    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        await bot.api.setWebhook(props.WebhookUrl, {
          secret_token: secretToken,
        });
        break;
      case 'Delete':
        await bot.api.deleteWebhook();
        break;
    }

    return {
      Status: 'SUCCESS',
      PhysicalResourceId: physicalId,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: { WebhookUrl: props.WebhookUrl },
    };
  } catch (error) {
    return {
      Status: 'FAILED',
      PhysicalResourceId: physicalId,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Reason: error instanceof Error ? error.message : String(error),
    };
  }
};
