import type { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import type { BotUser } from '../../../src/core/domain/user';
import { createUserBroadcaster } from '../../../src/telegram/user-broadcaster';
import {
  createMockUsersRepository,
  createSilentLogger,
} from '../../helpers/mocks';

function user(id: string): BotUser {
  return {
    id,
    isActive: true,
    isBot: false,
    isPremium: false,
    languageCode: '',
    firstName: '',
    lastName: '',
    username: '',
    startDate: '2025-01-01T00:00:00.000Z',
  };
}

function fakeBot(sendMessage: (...args: unknown[]) => Promise<unknown>): Bot {
  return { api: { sendMessage } } as unknown as Bot;
}

function blockedError(): Error {
  const err = new Error('Forbidden: bot was blocked by the user') as Error & {
    error_code: number;
  };
  err.error_code = 403;
  return err;
}

describe('createUserBroadcaster', () => {
  it('sends the message to every recipient and counts successes', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const users = createMockUsersRepository();
    const sleep = vi.fn().mockResolvedValue(undefined);

    const broadcaster = createUserBroadcaster({
      bot: fakeBot(sendMessage),
      users,
      logger: createSilentLogger(),
      sleep,
      delayMs: 50,
    });

    const result = await broadcaster.broadcast('hi', [
      user('1'),
      user('2'),
      user('3'),
    ]);

    expect(result).toEqual({ sent: 3, failed: 0, deactivated: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage.mock.calls.map(c => c[0])).toEqual(['1', '2', '3']);
    expect(sendMessage.mock.calls.map(c => c[1])).toEqual(['hi', 'hi', 'hi']);
  });

  it('sends with parse_mode HTML and link previews disabled', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});

    const broadcaster = createUserBroadcaster({
      bot: fakeBot(sendMessage),
      users: createMockUsersRepository(),
      logger: createSilentLogger(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await broadcaster.broadcast('<b>hi</b>', [user('1')]);

    expect(sendMessage.mock.calls[0]![2]).toEqual({
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  it('sleeps N-1 times between sends (skips the wait after the last user)', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const sleep = vi.fn().mockResolvedValue(undefined);

    const broadcaster = createUserBroadcaster({
      bot: fakeBot(sendMessage),
      users: createMockUsersRepository(),
      logger: createSilentLogger(),
      sleep,
      delayMs: 200,
    });

    await broadcaster.broadcast('hi', [user('1'), user('2'), user('3')]);

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(200);
  });

  it('does not sleep when there is a single recipient', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const sleep = vi.fn();

    const broadcaster = createUserBroadcaster({
      bot: fakeBot(sendMessage),
      users: createMockUsersRepository(),
      logger: createSilentLogger(),
      sleep,
    });

    await broadcaster.broadcast('hi', [user('1')]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('deactivates the user on Telegram 403 and continues with the rest', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(blockedError())
      .mockResolvedValueOnce({});
    const users = createMockUsersRepository();

    const broadcaster = createUserBroadcaster({
      bot: fakeBot(sendMessage),
      users,
      logger: createSilentLogger(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const result = await broadcaster.broadcast('hi', [
      user('1'),
      user('2'),
      user('3'),
    ]);

    expect(result).toEqual({ sent: 2, failed: 1, deactivated: 1 });
    expect(users.deactivate).toHaveBeenCalledWith('2');
  });

  it('logs and continues on non-403 errors without deactivating', async () => {
    const networkError = new Error('connection reset');
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({});
    const users = createMockUsersRepository();
    const logger = createSilentLogger();

    const broadcaster = createUserBroadcaster({
      bot: fakeBot(sendMessage),
      users,
      logger,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const result = await broadcaster.broadcast('hi', [user('1'), user('2')]);

    expect(result).toEqual({ sent: 1, failed: 1, deactivated: 0 });
    expect(users.deactivate).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'failed to broadcast to user',
      expect.objectContaining({ userId: '1' }),
    );
  });

  it('returns zeros for an empty recipient list', async () => {
    const sendMessage = vi.fn();
    const broadcaster = createUserBroadcaster({
      bot: fakeBot(sendMessage),
      users: createMockUsersRepository(),
      logger: createSilentLogger(),
      sleep: vi.fn(),
    });

    await expect(broadcaster.broadcast('hi', [])).resolves.toEqual({
      sent: 0,
      failed: 0,
      deactivated: 0,
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
