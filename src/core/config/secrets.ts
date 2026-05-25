import {
  GetParametersCommand,
  SSMClient,
  type SSMClientConfig,
} from '@aws-sdk/client-ssm';

import { withTimeout } from '../util/with-timeout';

/**
 * Secret values fetched from SSM Parameter Store at Lambda cold start.
 *
 * CloudFormation does NOT support `{{resolve:ssm-secure:...}}` dynamic
 * references in `AWS::Lambda::Function.Environment.Variables` (see CFN docs
 * - SecureString refs are only valid for an allowlist of resource
 * properties, which does not include Lambda env vars). So the Lambda
 * fetches them itself at runtime, once per container.
 */
export type BotSecrets = {
  botToken: string;
  logsBotToken: string;
  logsChatId: string;
};

export type SecretParameterNames = {
  botTokenName: string;
  logsBotTokenName: string;
  logsChatIdName: string;
};

export type FetchSecretsOptions = SecretParameterNames & {
  /** Defaults to a fresh `SSMClient`. Inject your own for tests. */
  client?: SSMClient;
  /** Region passed to the default client. Ignored if `client` is provided. */
  region?: string;
  /** Override the per-call timeout. Defaults to {@link SSM_TIMEOUT_MS}. */
  timeoutMs?: number;
};

/**
 * Hard cap on a single SSM `GetParameters` call. SSM normally responds in
 * 50-200ms; anything beyond 5s indicates IAM or networking trouble, and we
 * want to surface that as a thrown error (visible in logs) instead of
 * silently consuming the Lambda invocation timeout.
 */
export const SSM_TIMEOUT_MS = 5000;

/**
 * Fetches all three secrets in a single `GetParameters` round-trip
 * (~50-100ms total on cold start). Decryption happens server-side; the
 * Lambda execution role needs `ssm:GetParameters` on the parameter ARNs
 * and `kms:Decrypt` scoped to `kms:ViaService = ssm.<region>.amazonaws.com`.
 *
 * Throws (with all missing names listed) if any parameter is absent or
 * returns an empty value, so misconfiguration fails fast at cold start
 * rather than mid-update.
 */
export async function fetchSecrets(
  options: FetchSecretsOptions,
): Promise<BotSecrets> {
  const { botTokenName, logsBotTokenName, logsChatIdName } = options;
  const client = resolveClient(options);

  const names = [botTokenName, logsBotTokenName, logsChatIdName];

  // The AWS SDK has no default request timeout, so a misconfigured
  // network or IAM setup hangs silently until Lambda's invocation
  // timeout kills the process. Cap the call ourselves so the failure
  // mode is a visible thrown error instead of a 15s ghost.
  const result = await withTimeout(
    client.send(
      new GetParametersCommand({
        Names: names,
        WithDecryption: true,
      }),
    ),
    options.timeoutMs ?? SSM_TIMEOUT_MS,
    `SSM GetParameters for [${names.join(', ')}]`,
  );

  if (result.InvalidParameters && result.InvalidParameters.length > 0) {
    throw new Error(
      `SSM parameters not found: ${result.InvalidParameters.join(', ')}. ` +
        `Run 'npm run secrets' to provision them.`,
    );
  }

  const byName = new Map(
    (result.Parameters ?? []).map(p => [p.Name, p.Value ?? '']),
  );

  const missing: string[] = [];
  const pick = (name: string): string => {
    const value = byName.get(name);
    if (!value) {
      missing.push(name);
      return '';
    }
    return value;
  };

  const secrets: BotSecrets = {
    botToken: pick(botTokenName),
    logsBotToken: pick(logsBotTokenName),
    logsChatId: pick(logsChatIdName),
  };

  if (missing.length > 0) {
    throw new Error(
      `SSM returned empty values for: ${missing.join(', ')}. ` +
        `Re-run 'npm run secrets' after putting real values in .env.`,
    );
  }

  return secrets;
}

function resolveClient(options: FetchSecretsOptions): SSMClient {
  if (options.client) return options.client;
  return new SSMClient(
    options.region ? ({ region: options.region } as SSMClientConfig) : {},
  );
}
