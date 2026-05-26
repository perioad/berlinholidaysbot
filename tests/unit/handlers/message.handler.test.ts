import type { Context, Filter } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { buildNewUser } from '../../../src/core/domain/user';
import { createMessageHandler } from '../../../src/telegram/handlers/message.handler';
import {
  createMockAdminNotifier,
  createMockUsersRepository,
  createSilentLogger,
} from '../../helpers/mocks';

function makeDeps() {
  return {
    users: createMockUsersRepository(),
    adminNotifier: createMockAdminNotifier(),
    logger: createSilentLogger(),
    buildUser: buildNewUser,
    fetchHolidays: vi.fn().mockResolvedValue([]),
  };
}

function ctxFor(text: string): Filter<Context, 'message:text'> {
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    from: { id: 7, is_bot: false, first_name: 'Ada' },
    message: { text },
    reply,
  } as unknown as Filter<Context, 'message:text'>;
}

describe('messageHandler', () => {
  it('replies with the welcome message', async () => {
    const deps = makeDeps();
    const ctx = ctxFor('something');

    await createMessageHandler(deps)(ctx);

    expect(ctx.reply).toHaveBeenCalledOnce();
    expect(ctx.reply).toHaveBeenCalledWith('hello world');
  });

  it('notifies admin with the sender and the message text', async () => {
    const deps = makeDeps();
    const ctx = ctxFor('hi bot');

    await createMessageHandler(deps)(ctx);

    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    const message = deps.adminNotifier.notify.mock.calls[0]![0] as string;
    expect(message).toMatch(/^User message:/);
    expect(message).toContain('"first_name":"Ada"');
    expect(message).toContain('hi bot');
  });
});
