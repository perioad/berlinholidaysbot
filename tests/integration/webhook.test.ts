import { Bot, type RawApi, type Transformer } from 'grammy';
import type { UserFromGetMe, Update } from 'grammy/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsersRepository } from '../../src/core/database/users-repository';
import { buildNewUser, type BotUser } from '../../src/core/domain/user';
import { createBot } from '../../src/telegram/bot-factory';
import {
  createMockAdminNotifier,
  createSilentLogger,
} from '../helpers/mocks';

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'TestBot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  can_manage_bots: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
} as unknown as UserFromGetMe;

type OutgoingCall = {
  method: keyof RawApi;
  payload: unknown;
};

function buildHarness(opts: { usersOverride?: Partial<UsersRepository> } = {}) {
  const calls: OutgoingCall[] = [];

  const captureTransformer: Transformer = async (prev, method, payload) => {
    calls.push({ method, payload });

    if (method === 'sendMessage') {
      return {
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 10_000),
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: (payload as { chat_id: number }).chat_id,
            type: 'private',
          },
          text: (payload as { text: string }).text,
        },
      } as Awaited<ReturnType<typeof prev>>;
    }

    return { ok: true, result: true } as Awaited<ReturnType<typeof prev>>;
  };

  const users: UsersRepository = {
    getById: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    reactivate: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    ...opts.usersOverride,
  };

  const adminNotifier = createMockAdminNotifier();

  const bot = new Bot('test-token', { botInfo: BOT_INFO });
  bot.api.config.use(captureTransformer);

  createBot({
    token: 'test-token',
    bot,
    deps: {
      users,
      adminNotifier,
      logger: createSilentLogger(),
      buildUser: buildNewUser,
    },
  });

  return { bot, calls, users, adminNotifier };
}

function startUpdate(): Update {
  return {
    update_id: 1,
    message: {
      message_id: 100,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 555, type: 'private', first_name: 'Ada' },
      from: { id: 555, is_bot: false, first_name: 'Ada', language_code: 'en' },
      text: '/start',
      entities: [{ type: 'bot_command', offset: 0, length: 6 }],
    },
  } as Update;
}

function textUpdate(text: string): Update {
  return {
    update_id: 2,
    message: {
      message_id: 101,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 555, type: 'private', first_name: 'Ada' },
      from: { id: 555, is_bot: false, first_name: 'Ada' },
      text,
    },
  } as Update;
}

function kickedUpdate(): Update {
  return {
    update_id: 3,
    my_chat_member: {
      chat: { id: 555, type: 'private', first_name: 'Ada' },
      from: { id: 555, is_bot: false, first_name: 'Ada' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: {
        user: BOT_INFO,
        status: 'member',
      },
      new_chat_member: {
        user: BOT_INFO,
        status: 'kicked',
        until_date: 0,
      },
    },
  } as Update;
}

describe('webhook integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('on /start: saves a new user, notifies admin, and replies with "hello world"', async () => {
    const { bot, calls, users, adminNotifier } = buildHarness();

    await bot.handleUpdate(startUpdate());

    expect(users.save).toHaveBeenCalledOnce();
    expect(users.reactivate).not.toHaveBeenCalled();

    const sends = calls.filter(c => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect((sends[0]!.payload as { text: string }).text).toBe('hello world');

    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    expect(adminNotifier.notify.mock.calls[0]![0]).toMatch(/^New user:/);
  });

  it('on /start with an existing inactive user: reactivates, notifies, and replies', async () => {
    const existing: BotUser = {
      id: '555',
      isActive: false,
      isBot: false,
      isPremium: false,
      languageCode: 'en',
      firstName: 'Ada',
      lastName: '',
      username: '',
      startDate: '2025-01-01T00:00:00.000Z',
    };

    const { bot, users, adminNotifier } = buildHarness({
      usersOverride: { getById: vi.fn().mockResolvedValue(existing) },
    });

    await bot.handleUpdate(startUpdate());

    expect(users.reactivate).toHaveBeenCalledWith('555');
    expect(users.save).not.toHaveBeenCalled();
    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    expect(adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^User reactivated:/,
    );
  });

  it('on any text message: replies "hello world" and notifies admin', async () => {
    const { bot, calls, adminNotifier } = buildHarness();

    await bot.handleUpdate(textUpdate('random chatter'));

    const sends = calls.filter(c => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect((sends[0]!.payload as { text: string }).text).toBe('hello world');

    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    const notification = adminNotifier.notify.mock.calls[0]![0];
    expect(notification).toMatch(/^User message:/);
    expect(notification).toContain('random chatter');
  });

  it('on my_chat_member kicked: deactivates the user and notifies admin', async () => {
    const { bot, users, adminNotifier } = buildHarness();

    await bot.handleUpdate(kickedUpdate());

    expect(users.deactivate).toHaveBeenCalledWith('555');
    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    expect(adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^User left \(kicked\):/,
    );
  });

  it('routes thrown errors through the admin notifier', async () => {
    const boom = new Error('db down');
    const { bot, adminNotifier } = buildHarness({
      usersOverride: {
        getById: vi.fn().mockRejectedValue(boom),
      },
    });

    await bot.handleUpdate(startUpdate());

    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    const [message] = adminNotifier.notify.mock.calls[0]!;
    expect(message).toMatch(/^\[ERROR /);
    expect(message).toContain('Error: db down');
  });
});
