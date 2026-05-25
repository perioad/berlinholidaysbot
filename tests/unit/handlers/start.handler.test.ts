import type { CommandContext, Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { buildNewUser } from '../../../src/core/domain/user';
import type { UsersRepository } from '../../../src/core/database/users-repository';
import { createStartHandler } from '../../../src/telegram/handlers/start.handler';
import {
  createMockAdminNotifier,
  createSilentLogger,
} from '../../helpers/mocks';

function makeDeps(usersOverride?: Partial<UsersRepository>) {
  const users: UsersRepository = {
    getById: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    reactivate: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    ...usersOverride,
  };

  return {
    users,
    adminNotifier: createMockAdminNotifier(),
    logger: createSilentLogger(),
    buildUser: buildNewUser,
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
  it('saves a new user, notifies admin, and replies "hello world"', async () => {
    const deps = makeDeps();
    const ctx = ctxFor(7);
    const reply = ctx.reply as ReturnType<typeof vi.fn>;

    await createStartHandler(deps)(ctx);

    expect(deps.users.save).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(/^New user:/);
    expect(reply).toHaveBeenCalledWith('hello world');
  });

  it('reactivates an existing inactive user and notifies admin', async () => {
    const deps = makeDeps({
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
    });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    expect(deps.users.reactivate).toHaveBeenCalledWith('7');
    expect(deps.users.save).not.toHaveBeenCalled();
    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^User reactivated:/,
    );
  });

  it('does not notify admin when the user is already active', async () => {
    const deps = makeDeps({
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
    });
    const ctx = ctxFor(7);

    await createStartHandler(deps)(ctx);

    expect(deps.users.save).not.toHaveBeenCalled();
    expect(deps.users.reactivate).not.toHaveBeenCalled();
    expect(deps.adminNotifier.notify).not.toHaveBeenCalled();
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
