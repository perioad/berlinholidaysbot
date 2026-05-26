import { Bot, type RawApi, type Transformer } from 'grammy';
import type { UserFromGetMe, Update } from 'grammy/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsersRepository } from '../../src/core/database/users-repository';
import { buildNewUser, type BotUser } from '../../src/core/domain/user';
import type { Holiday } from '../../src/core/holidays/types';
import { createBot } from '../../src/telegram/bot-factory';
import {
  createMockAdminNotifier,
  createMockUsersRepository,
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

type BuildHarnessOptions = {
  usersOverride?: Partial<UsersRepository>;
  fetchHolidays?: (year: number) => Promise<Holiday[]>;
};

function buildHarness(opts: BuildHarnessOptions = {}) {
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

  const users = createMockUsersRepository(opts.usersOverride);

  const adminNotifier = createMockAdminNotifier();
  const fetchHolidays = vi
    .fn<(year: number) => Promise<Holiday[]>>()
    .mockImplementation(opts.fetchHolidays ?? (async () => []));

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
      fetchHolidays,
    },
  });

  return { bot, calls, users, adminNotifier, fetchHolidays };
}

const ACTIVE_USER: BotUser = {
  id: '555',
  isActive: true,
  isBot: false,
  isPremium: false,
  languageCode: 'en',
  firstName: 'Ada',
  lastName: '',
  username: '',
  startDate: '2025-01-01T00:00:00.000Z',
};

const INACTIVE_USER: BotUser = { ...ACTIVE_USER, isActive: false };

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

  it('on /start (new user): saves user, notifies admin, replies with the greeting', async () => {
    const { bot, calls, users, adminNotifier } = buildHarness();

    await bot.handleUpdate(startUpdate());

    expect(users.save).toHaveBeenCalledOnce();
    expect(users.reactivate).not.toHaveBeenCalled();

    const sends = calls.filter(c => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect((sends[0]!.payload as { text: string }).text).toBe('Hallöchen!');

    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    expect(adminNotifier.notify.mock.calls[0]![0]).toMatch(/^New user:/);
  });

  it('on /start (new user) with upcoming holidays: sends a second message with the list', async () => {
    const thisYear = new Date().getUTCFullYear();
    const futureHoliday: Holiday = {
      date: `${thisYear + 1}-01-01`,
      localName: 'Neujahr',
      name: "New Year's Day",
      global: true,
      counties: null,
    };

    const { bot, calls, fetchHolidays } = buildHarness({
      fetchHolidays: async year =>
        year === thisYear + 1 ? [futureHoliday] : [],
    });

    await bot.handleUpdate(startUpdate());

    expect(fetchHolidays).toHaveBeenCalledWith(thisYear);
    expect(fetchHolidays).toHaveBeenCalledWith(thisYear + 1);

    const sends = calls.filter(c => c.method === 'sendMessage');
    expect(sends).toHaveLength(2);
    expect((sends[0]!.payload as { text: string }).text).toBe('Hallöchen!');
    expect((sends[1]!.payload as { text: string }).text).toContain(
      'Upcoming Berlin public holidays:',
    );
    expect((sends[1]!.payload as { text: string }).text).toContain('Neujahr');
  });

  it('on /start (inactive user): reactivates, greets, and sends the holiday list', async () => {
    const thisYear = new Date().getUTCFullYear();
    const futureHoliday: Holiday = {
      date: `${thisYear + 1}-01-01`,
      localName: 'Neujahr',
      name: "New Year's Day",
      global: true,
      counties: null,
    };

    const { bot, calls, users, adminNotifier } = buildHarness({
      usersOverride: { getById: vi.fn().mockResolvedValue(INACTIVE_USER) },
      fetchHolidays: async year =>
        year === thisYear + 1 ? [futureHoliday] : [],
    });

    await bot.handleUpdate(startUpdate());

    expect(users.reactivate).toHaveBeenCalledWith('555');
    expect(users.save).not.toHaveBeenCalled();

    const sends = calls.filter(c => c.method === 'sendMessage');
    expect(sends).toHaveLength(2);
    expect((sends[0]!.payload as { text: string }).text).toBe('Hallöchen!');
    expect((sends[1]!.payload as { text: string }).text).toContain(
      'Upcoming Berlin public holidays:',
    );
    expect((sends[1]!.payload as { text: string }).text).toContain('Neujahr');

    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    expect(adminNotifier.notify.mock.calls[0]![0]).toMatch(/^User reactivated:/);
  });

  it('on /start (already active): replies "already subscribed" and notifies admin', async () => {
    const { bot, calls, users, adminNotifier } = buildHarness({
      usersOverride: { getById: vi.fn().mockResolvedValue(ACTIVE_USER) },
    });

    await bot.handleUpdate(startUpdate());

    expect(users.save).not.toHaveBeenCalled();
    expect(users.reactivate).not.toHaveBeenCalled();

    const sends = calls.filter(c => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect((sends[0]!.payload as { text: string }).text).toBe(
      'You are already subscribed!',
    );

    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    expect(adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^User ran \/start while already active:/,
    );
  });

  it('on any text message: replies with the chat-not-supported notice and notifies admin', async () => {
    const { bot, calls, adminNotifier } = buildHarness();

    await bot.handleUpdate(textUpdate('random chatter'));

    const sends = calls.filter(c => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    const reply = (sends[0]!.payload as { text: string }).text;
    expect(reply).toContain("Chats aren't supported");
    expect(reply).toContain('feedback');

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

    const errorNotifications = adminNotifier.notify.mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((m: string) => m.startsWith('[ERROR'));
    expect(errorNotifications).toHaveLength(1);
    expect(errorNotifications[0]).toContain('Error: db down');
  });
});
