import { Bot } from 'grammy';
import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from 'aws-lambda';

/**
 * CDK Custom Resource handler that registers (and unregisters) the Telegram
 * webhook with the freshly-deployed API Gateway URL.
 *
 * `ResourceProperties` is supplied by the CDK construct in
 * `infra/lib/constructs/webhook-registrar.construct.ts`.
 */
type WebhookProperties = {
  BotToken: string;
  WebhookUrl: string;
  SecretToken?: string;
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

  if (!props.BotToken || !props.WebhookUrl) {
    throw new Error(
      'WebhookRegistrar requires BotToken and WebhookUrl ResourceProperties',
    );
  }

  return props;
}

export const handler = async (
  event: CloudFormationCustomResourceEvent,
): Promise<CloudFormationCustomResourceResponse> => {
  const props = getProperties(event);
  const bot = new Bot(props.BotToken);
  const physicalId = `telegram-webhook-${props.WebhookUrl}`;

  try {
    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        await bot.api.setWebhook(props.WebhookUrl, {
          secret_token: props.SecretToken,
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
