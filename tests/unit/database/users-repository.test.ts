import { describe, expect, it, vi } from 'vitest';

import { upsertOnStart } from '../../../src/core/database/users-repository';
import { buildNewUser, type BotUser } from '../../../src/core/domain/user';
import type { UsersRepository } from '../../../src/core/database/users-repository';

function makeRepo() {
  const getById = vi.fn();
  const save = vi.fn();
  const reactivate = vi.fn();
  const deactivate = vi.fn();
  const listActive = vi.fn();

  const repo: UsersRepository = {
    getById,
    save,
    reactivate,
    deactivate,
    listActive,
  };

  return { repo, getById, save, reactivate, deactivate, listActive };
}

const snapshot = { id: 7, is_bot: false } as const;

describe('upsertOnStart', () => {
  it('creates and saves a new user when not present', async () => {
    const { repo, getById, save, reactivate } = makeRepo();
    getById.mockResolvedValue(null);

    const { status, user } = await upsertOnStart(repo, snapshot, buildNewUser);

    expect(status).toBe('new');
    expect(user.id).toBe('7');
    expect(save).toHaveBeenCalledOnce();
    expect(reactivate).not.toHaveBeenCalled();
  });

  it('reactivates an existing inactive user', async () => {
    const { repo, getById, save, reactivate } = makeRepo();
    const existing: BotUser = {
      id: '7',
      isActive: false,
      isBot: false,
      isPremium: false,
      languageCode: '',
      firstName: '',
      lastName: '',
      username: '',
      startDate: '2020-01-01T00:00:00.000Z',
    };
    getById.mockResolvedValue(existing);

    const { status, user } = await upsertOnStart(repo, snapshot, buildNewUser);

    expect(status).toBe('reactivated');
    expect(user.isActive).toBe(true);
    expect(reactivate).toHaveBeenCalledWith('7');
    expect(save).not.toHaveBeenCalled();
  });

  it('is a no-op when the user is already active', async () => {
    const { repo, getById, save, reactivate } = makeRepo();
    const existing: BotUser = {
      id: '7',
      isActive: true,
      isBot: false,
      isPremium: false,
      languageCode: '',
      firstName: '',
      lastName: '',
      username: '',
      startDate: '2020-01-01T00:00:00.000Z',
    };
    getById.mockResolvedValue(existing);

    const { status } = await upsertOnStart(repo, snapshot, buildNewUser);

    expect(status).toBe('already-active');
    expect(save).not.toHaveBeenCalled();
    expect(reactivate).not.toHaveBeenCalled();
  });
});
