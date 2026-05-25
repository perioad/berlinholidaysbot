import type { Context, Filter } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { buildNewUser } from '../../../src/core/domain/user';
import { createChatMemberHandler } from '../../../src/telegram/handlers/chat-member.handler';
import {
  createMockAdminNotifier,
  createSilentLogger,
} from '../../helpers/mocks';

function deps() {
  return {
    users: {
      getById: vi.fn(),
      save: vi.fn(),
      reactivate: vi.fn(),
      deactivate: vi.fn().mockResolvedValue(undefined),
    },
    adminNotifier: createMockAdminNotifier(),
    logger: createSilentLogger(),
    buildUser: buildNewUser,
  };
}

function ctxWithStatus(
  status: string,
): Filter<Context, 'my_chat_member'> {
  return {
    chat: { id: 555 },
    from: { id: 555, is_bot: false, first_name: 'Ada' },
    myChatMember: {
      new_chat_member: { status },
    },
  } as unknown as Filter<Context, 'my_chat_member'>;
}

describe('chatMemberHandler', () => {
  it('deactivates the user and notifies admin when the bot is kicked', async () => {
    const d = deps();
    await createChatMemberHandler(d)(ctxWithStatus('kicked'));
    expect(d.users.deactivate).toHaveBeenCalledWith('555');
    expect(d.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(d.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^User left \(kicked\):/,
    );
  });

  it('deactivates and notifies on "left" (for groups)', async () => {
    const d = deps();
    await createChatMemberHandler(d)(ctxWithStatus('left'));
    expect(d.users.deactivate).toHaveBeenCalledWith('555');
    expect(d.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(d.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^User left \(left\):/,
    );
  });

  it('ignores other status transitions (member, administrator, ...)', async () => {
    const d = deps();
    await createChatMemberHandler(d)(ctxWithStatus('member'));
    await createChatMemberHandler(d)(ctxWithStatus('administrator'));
    expect(d.users.deactivate).not.toHaveBeenCalled();
    expect(d.adminNotifier.notify).not.toHaveBeenCalled();
  });
});
