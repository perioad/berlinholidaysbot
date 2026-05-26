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
    const secondCall = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[1]![0];
    expect(secondCall).toContain('Upcoming Berlin public holidays:');
    expect(secondCall).toContain('Neujahr');
  });

  it('does not send a list when there are no upcoming holidays', async () => {
    const deps = makeDeps({ fetchHolidays: async () => [] });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
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
