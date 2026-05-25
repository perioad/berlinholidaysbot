import {
  GetParameterCommand,
  GetParametersCommand,
  SSMClient,
  type SSMClientConfig,
} from '@aws-sdk/client-ssm';

/**
 * Secret values fetched from SSM Parameter Store at Lambda cold start.
 *
 * CloudFormation does NOT support `{{resolve:ssm-secure:...}}` dynamic
 * references in `AWS::Lambda::Function.Environment.Variables` (see CFN docs
 * - SecureString refs are only valid for an allowlist of resource
 * properties, which does not include Lambda env vars). So each Lambda
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

/** Options shared by every fetch helper in this module. */
type SsmFetchOptions = {
  /** Defaults to a fresh `SSMClient`. Inject your own for tests. */
  client?: SSMClient;
  /** Region passed to the default client. Ignored if `client` is provided. */
  region?: string;
};

export type FetchSecretsOptions = SecretParameterNames & SsmFetchOptions;

export type FetchBotTokenOptions = SsmFetchOptions & {
  paramName: string;
};

function resolveClient(options: SsmFetchOptions): SSMClient {
  if (options.client) return options.client;
  return new SSMClient(
    options.region ? ({ region: options.region } as SSMClientConfig) : {},
  );
}

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

  const result = await client.send(
    new GetParametersCommand({
      Names: names,
      WithDecryption: true,
    }),
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

/**
 * Fetches a single SSM SecureString. Used by the webhook-registrar Lambda
 * which only needs the bot token. Same IAM and same error semantics as
 * `fetchSecrets`, just narrower.
 */
export async function fetchBotToken(
  options: FetchBotTokenOptions,
): Promise<string> {
  const client = resolveClient(options);

  const result = await client.send(
    new GetParameterCommand({
      Name: options.paramName,
      WithDecryption: true,
    }),
  );

  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error(
      `SSM parameter ${options.paramName} is empty or missing. ` +
        `Run 'npm run secrets' to provision it.`,
    );
  }
  return value;
}
