import { describe, expect, it } from 'vitest';

import { parseEnv } from '../../../src/core/config/env';

const validEnv = {
  BOT_TOKEN: 'bot-token',
  LOGS_BOT_TOKEN: 'logs-token',
  LOGS_CHAT_ID: '12345',
  USERS_TABLE_NAME: 'users',
  AWS_REGION: 'eu-central-1',
};

describe('parseEnv', () => {
  it('returns parsed values when all required vars are present', () => {
    const env = parseEnv(validEnv);

    expect(env.BOT_TOKEN).toBe('bot-token');
    expect(env.LOGS_BOT_TOKEN).toBe('logs-token');
    expect(env.LOGS_CHAT_ID).toBe('12345');
    expect(env.USERS_TABLE_NAME).toBe('users');
    expect(env.AWS_REGION).toBe('eu-central-1');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
  });

  it('honours an explicit LOG_LEVEL override', () => {
    const env = parseEnv({ ...validEnv, LOG_LEVEL: 'debug' });
    expect(env.LOG_LEVEL).toBe('debug');
  });

  it('passes TELEGRAM_WEBHOOK_SECRET through when provided', () => {
    const env = parseEnv({ ...validEnv, TELEGRAM_WEBHOOK_SECRET: 'shh' });
    expect(env.TELEGRAM_WEBHOOK_SECRET).toBe('shh');
  });

  it('throws a descriptive error when BOT_TOKEN is missing', () => {
    const partial = { ...validEnv, BOT_TOKEN: undefined };
    expect(() => parseEnv(partial)).toThrowError(/BOT_TOKEN/);
  });

  it('throws when LOG_LEVEL is invalid', () => {
    expect(() => parseEnv({ ...validEnv, LOG_LEVEL: 'loud' })).toThrowError(
      /LOG_LEVEL/,
    );
  });

  it('throws when multiple values are missing, listing all of them', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        BOT_TOKEN: undefined,
        LOGS_BOT_TOKEN: undefined,
      }),
    ).toThrowError(/BOT_TOKEN[\s\S]*LOGS_BOT_TOKEN/);
  });
});
