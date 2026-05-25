import {
  GetParameterCommand,
  GetParametersCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fetchBotToken, fetchSecrets } from '../../../src/core/config/secrets';

const NAMES = {
  botTokenName: '/berlinholidaysbot/bot-token',
  logsBotTokenName: '/berlinholidaysbot/logs-bot-token',
  logsChatIdName: '/berlinholidaysbot/logs-chat-id',
};

describe('fetchSecrets', () => {
  const ssm = mockClient(SSMClient);

  beforeEach(() => {
    ssm.reset();
  });

  afterEach(() => {
    ssm.reset();
  });

  it('returns all three secret values in a single GetParameters call', async () => {
    ssm.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: NAMES.botTokenName, Value: 'bot-secret' },
        { Name: NAMES.logsBotTokenName, Value: 'logs-secret' },
        { Name: NAMES.logsChatIdName, Value: '12345' },
      ],
      InvalidParameters: [],
    });

    const result = await fetchSecrets({
      ...NAMES,
      client: ssm as unknown as SSMClient,
    });

    expect(result).toEqual({
      botToken: 'bot-secret',
      logsBotToken: 'logs-secret',
      logsChatId: '12345',
    });

    const calls = ssm.commandCalls(GetParametersCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]!.args[0].input;
    expect(input.WithDecryption).toBe(true);
    expect(new Set(input.Names)).toEqual(new Set(Object.values(NAMES)));
  });

  it('throws when SSM reports invalid parameters, listing each one', async () => {
    ssm.on(GetParametersCommand).resolves({
      Parameters: [{ Name: NAMES.botTokenName, Value: 'bot-secret' }],
      InvalidParameters: [NAMES.logsBotTokenName, NAMES.logsChatIdName],
    });

    await expect(
      fetchSecrets({ ...NAMES, client: ssm as unknown as SSMClient }),
    ).rejects.toThrow(/logs-bot-token.*logs-chat-id/);
  });

  it('throws when SSM returns empty values', async () => {
    ssm.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: NAMES.botTokenName, Value: 'bot-secret' },
        { Name: NAMES.logsBotTokenName, Value: '' },
        { Name: NAMES.logsChatIdName, Value: '12345' },
      ],
      InvalidParameters: [],
    });

    await expect(
      fetchSecrets({ ...NAMES, client: ssm as unknown as SSMClient }),
    ).rejects.toThrow(/logs-bot-token/);
  });
});

describe('fetchBotToken', () => {
  const ssm = mockClient(SSMClient);

  beforeEach(() => {
    ssm.reset();
  });

  afterEach(() => {
    ssm.reset();
  });

  it('returns the decrypted bot token', async () => {
    ssm.on(GetParameterCommand).resolves({
      Parameter: { Name: NAMES.botTokenName, Value: 'bot-secret' },
    });

    const token = await fetchBotToken({
      paramName: NAMES.botTokenName,
      client: ssm as unknown as SSMClient,
    });

    expect(token).toBe('bot-secret');
    const calls = ssm.commandCalls(GetParameterCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input).toEqual({
      Name: NAMES.botTokenName,
      WithDecryption: true,
    });
  });

  it('throws when the parameter is missing', async () => {
    ssm.on(GetParameterCommand).resolves({});

    await expect(
      fetchBotToken({
        paramName: NAMES.botTokenName,
        client: ssm as unknown as SSMClient,
      }),
    ).rejects.toThrow(/bot-token/);
  });
});
