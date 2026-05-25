import { describe, expect, it } from 'vitest';

import { buildNewUser } from '../../../src/core/domain/user';

describe('buildNewUser', () => {
  it('maps a full Telegram snapshot to a BotUser', () => {
    const now = new Date('2030-01-01T00:00:00.000Z');

    const user = buildNewUser(
      {
        id: 42,
        is_bot: false,
        is_premium: true,
        language_code: 'en',
        first_name: 'Ada',
        last_name: 'Lovelace',
        username: 'ada',
      },
      () => now,
    );

    expect(user).toEqual({
      id: '42',
      isActive: true,
      isBot: false,
      isPremium: true,
      languageCode: 'en',
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      startDate: now.toISOString(),
    });
  });

  it('uses empty strings/false for missing optional fields', () => {
    const user = buildNewUser({ id: 1, is_bot: false });

    expect(user.isPremium).toBe(false);
    expect(user.languageCode).toBe('');
    expect(user.firstName).toBe('');
    expect(user.lastName).toBe('');
    expect(user.username).toBe('');
  });
});
