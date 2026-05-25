import { Bot } from 'grammy';
import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from 'aws-lambda';

import { fetchBotToken } from '../../src/core/config/secrets';

/**
 * CDK Custom Resource handler that registers (and unregisters) the
 * Telegram webhook with the freshly-deployed Function URL.
 *
 * The bot token is fetched from SSM at invocation time (CloudFormation
 * does not support `ssm-secure` dynamic references in Lambda env vars).
 * `BOT_TOKEN_PARAM_NAME` and `SECRET_TOKEN` arrive as env vars set by the
 * construct; nothing sensitive travels through `ResourceProperties`.
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

function getBotTokenParamName(): string {
  const paramName = process.env.BOT_TOKEN_PARAM_NAME;
  if (!paramName) {
    throw new Error('WebhookRegistrar handler missing BOT_TOKEN_PARAM_NAME');
  }
  return paramName;
}

export const handler = async (
  event: CloudFormationCustomResourceEvent,
): Promise<CloudFormationCustomResourceResponse> => {
  const props = getProperties(event);
  const secretToken = process.env.SECRET_TOKEN;
  const physicalId = `telegram-webhook-${props.WebhookUrl}`;

  try {
    const token = await fetchBotToken({ paramName: getBotTokenParamName() });
    const bot = new Bot(token);

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
