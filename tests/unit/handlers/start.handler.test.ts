import type { CommandContext, Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import type { UsersRepository } from '../../../src/core/database/users-repository';
import { buildNewUser } from '../../../src/core/domain/user';
import type { Holiday } from '../../../src/core/holidays/types';
import { createStartHandler } from '../../../src/telegram/handlers/start.handler';
import {
  createMockAdminNotifier,
  createMockUsersRepository,
  createSilentLogger,
} from '../../helpers/mocks';

type DepsOverrides = {
  users?: Partial<UsersRepository>;
  fetchHolidays?: (year: number) => Promise<Holiday[]>;
};

function makeDeps(overrides: DepsOverrides = {}) {
  return {
    users: createMockUsersRepository(overrides.users),
    adminNotifier: createMockAdminNotifier(),
    logger: createSilentLogger(),
    buildUser: buildNewUser,
    fetchHolidays: vi
      .fn<(year: number) => Promise<Holiday[]>>()
      .mockImplementation(overrides.fetchHolidays ?? (async () => [])),
  };
}

function ctxFor(fromId: number): CommandContext<Context> {
  return {
    update: { update_id: 1 },
    from: {
      id: fromId,
      is_bot: false,
      first_name: 'Ada',
      language_code: 'en',
    },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as CommandContext<Context>;
}

describe('startHandler', () => {
  it('saves a new user, notifies admin, and replies with welcome', async () => {
    const deps = makeDeps();
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    expect(deps.users.save).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(/^New user:/);
    expect(ctx.reply).toHaveBeenCalledWith('hello world');
  });

  it('fetches both this year + next year for new users and replies with the upcoming list', async () => {
    const today = new Date();
    const thisYear = today.getUTCFullYear();
    const futureHoliday: Holiday = {
      date: `${thisYear + 1}-01-01`,
      localName: 'Neujahr',
      name: "New Year's Day",
      global: true,
      counties: null,
    };

    const deps = makeDeps({
      fetchHolidays: async year => (year === thisYear ? [] : [futureHoliday]),
    });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    expect(deps.fetchHolidays).toHaveBeenCalledWith(thisYear);
    expect(deps.fetchHolidays).toHaveBeenCalledWith(thisYear + 1);
    expect(ctx.reply).toHaveBeenCalledTimes(2);
    const replyMock = ctx.reply as ReturnType<typeof vi.fn>;
    const secondCall = replyMock.mock.calls[1]!;
    expect(secondCall[0]).toContain('Upcoming Berlin public holidays:');
    expect(secondCall[0]).toContain('Neujahr');
    expect(secondCall[1]).toEqual({
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  // NOTE: the next two tests assume the handler treats "today" as
  // 2026-10-03 because of the manual-testing hardcode in
  // src/telegram/handlers/start.handler.ts. When that hardcode is
  // reverted to `new Date()`, switch these dates back to the real
  // current day (e.g. via `new Date().toISOString().slice(0, 10)`).
  const HARDCODED_TODAY_ISO = '2026-10-03';
  const HARDCODED_TODAY_YEAR = 2026;

  it('sends a "today is X, congrats!" message before the list when today is a Berlin holiday, and drops today from the list', async () => {
    const todayHoliday: Holiday = {
      date: HARDCODED_TODAY_ISO,
      localName: 'Today Test Holiday',
      name: 'Today Test Holiday',
      global: true,
      counties: null,
    };
    const laterHoliday: Holiday = {
      date: `${HARDCODED_TODAY_YEAR}-12-25`,
      localName: 'Erster Weihnachtstag',
      name: 'Christmas Day',
      global: true,
      counties: null,
    };

    const deps = makeDeps({
      fetchHolidays: async year =>
        year === HARDCODED_TODAY_YEAR ? [todayHoliday, laterHoliday] : [],
    });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    const replyMock = ctx.reply as ReturnType<typeof vi.fn>;
    expect(replyMock).toHaveBeenCalledTimes(3);

    expect(replyMock.mock.calls[0]![0]).toBe('hello world');

    const greeting = replyMock.mock.calls[1]![0] as string;
    expect(greeting).toContain('Today is');
    expect(greeting).toContain('Today Test Holiday');
    expect(greeting).toContain('congrats!');
    expect(greeting).toContain("See what's happening today:");
    expect(greeting).toContain('browse events on berlin.de');
    expect(replyMock.mock.calls[1]![1]).toEqual({
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });

    const list = replyMock.mock.calls[2]![0] as string;
    expect(list).toContain('Upcoming Berlin public holidays:');
    expect(list).toContain('Erster Weihnachtstag');
    expect(list).not.toContain('Today Test Holiday');
  });

  it('skips the upcoming list when today is the only upcoming holiday', async () => {
    const todayHoliday: Holiday = {
      date: HARDCODED_TODAY_ISO,
      localName: 'Today Test Holiday',
      name: 'Today Test Holiday',
      global: true,
      counties: null,
    };

    const deps = makeDeps({
      fetchHolidays: async year =>
        year === HARDCODED_TODAY_YEAR ? [todayHoliday] : [],
    });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    const replyMock = ctx.reply as ReturnType<typeof vi.fn>;
    expect(replyMock).toHaveBeenCalledTimes(2);
    expect(replyMock.mock.calls[0]![0]).toBe('hello world');
    expect(replyMock.mock.calls[1]![0]).toContain('Today is');
  });

  it('does not send a list when there are no upcoming holidays', async () => {
    const deps = makeDeps({ fetchHolidays: async () => [] });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
  });

  it('only keeps January of next year (drops Feb+ from next-year fetch)', async () => {
    const today = new Date();
    const thisYear = today.getUTCFullYear();
    const januaryNext: Holiday = {
      date: `${thisYear + 1}-01-01`,
      localName: 'Neujahr',
      name: "New Year's Day",
      global: true,
      counties: null,
    };
    const februaryNext: Holiday = {
      date: `${thisYear + 1}-02-15`,
      localName: 'Should-Be-Dropped',
      name: 'Should Be Dropped',
      global: true,
      counties: null,
    };
    const marchNext: Holiday = {
      date: `${thisYear + 1}-03-08`,
      localName: 'Internationaler Frauentag',
      name: "International Women's Day",
      global: false,
      counties: ['DE-BE'],
    };

    const deps = makeDeps({
      fetchHolidays: async year =>
        year === thisYear + 1
          ? [januaryNext, februaryNext, marchNext]
          : [],
    });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[1]![0] as string;
    expect(replyText).toContain('Neujahr');
    expect(replyText).not.toContain('Should-Be-Dropped');
    expect(replyText).not.toContain('Internationaler Frauentag');
  });

  it('survives a fetchHolidays failure and notifies admin', async () => {
    const deps = makeDeps({
      fetchHolidays: async () => {
        throw new Error('nager down');
      },
    });
    const ctx = ctxFor(7);

    await expect(createStartHandler(deps)(ctx)).resolves.toBeUndefined();
    expect(ctx.reply).toHaveBeenCalledWith('hello world');
    expect(deps.adminNotifier.notify).toHaveBeenCalledTimes(2); // user-joined + failure
    const calls = deps.adminNotifier.notify.mock.calls.map(c => c[0]);
    expect(calls.some(c => /Welcome holiday list failed/.test(c))).toBe(true);
  });

  it('reactivates an existing inactive user and also sends the upcoming holiday list', async () => {
    const today = new Date();
    const thisYear = today.getUTCFullYear();
    const futureHoliday: Holiday = {
      date: `${thisYear + 1}-01-01`,
      localName: 'Neujahr',
      name: "New Year's Day",
      global: true,
      counties: null,
    };

    const deps = makeDeps({
      users: {
        getById: vi.fn().mockResolvedValue({
          id: '7',
          isActive: false,
          isBot: false,
          isPremium: false,
          languageCode: '',
          firstName: '',
          lastName: '',
          username: '',
          startDate: '2025-01-01T00:00:00.000Z',
        }),
      },
      fetchHolidays: async year =>
        year === thisYear + 1 ? [futureHoliday] : [],
    });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    expect(deps.users.reactivate).toHaveBeenCalledWith('7');
    expect(deps.users.save).not.toHaveBeenCalled();
    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^User reactivated:/,
    );

    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect((ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      'Welcome back!',
    );
    expect(
      (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[1]![0],
    ).toContain('Upcoming Berlin public holidays:');
    expect(deps.fetchHolidays).toHaveBeenCalledWith(thisYear);
    expect(deps.fetchHolidays).toHaveBeenCalledWith(thisYear + 1);
  });

  it('replies "already subscribed" and does not send the holiday list', async () => {
    const deps = makeDeps({
      users: {
        getById: vi.fn().mockResolvedValue({
          id: '7',
          isActive: true,
          isBot: false,
          isPremium: false,
          languageCode: '',
          firstName: '',
          lastName: '',
          username: '',
          startDate: '2025-01-01T00:00:00.000Z',
        }),
      },
    });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    expect(deps.users.save).not.toHaveBeenCalled();
    expect(deps.users.reactivate).not.toHaveBeenCalled();
    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^User ran \/start while already active:/,
    );
    expect(ctx.reply).toHaveBeenCalledWith('You are already subscribed!');
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(deps.fetchHolidays).not.toHaveBeenCalled();
  });

  it('logs a warning and returns when ctx.from is missing', async () => {
    const deps = makeDeps();
    const ctx = {
      update: { update_id: 1 },
      from: undefined,
      reply: vi.fn(),
    } as unknown as CommandContext<Context>;

    await createStartHandler(deps)(ctx);

    expect(deps.logger.warn).toHaveBeenCalled();
    expect(deps.users.save).not.toHaveBeenCalled();
    expect(deps.adminNotifier.notify).not.toHaveBeenCalled();
  });
});
