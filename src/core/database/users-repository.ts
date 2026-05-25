import type { BotUser, TelegramUserSnapshot } from '../domain/user';

/**
 * Abstraction over the users persistence layer.
 *
 * Handlers depend on this type, never on DynamoDB directly, so we can swap
 * implementations (Postgres, in-memory for tests, etc.) without touching
 * business logic.
 */
export type UsersRepository = {
  getById: (id: string) => Promise<BotUser | null>;

  /** Inserts a brand-new user. Behaviour for an existing id is impl-defined. */
  save: (user: BotUser) => Promise<void>;

  /** Sets `isActive: true` and records a reactivation timestamp. */
  reactivate: (id: string) => Promise<void>;

  /** Sets `isActive: false` and records an end timestamp. */
  deactivate: (id: string) => Promise<void>;
};

/**
 * Convenience facade: handles the common "first-time vs returning user" branch
 * once, so every command/handler doesn't reimplement it.
 */
export async function upsertOnStart(
  repo: UsersRepository,
  snapshot: TelegramUserSnapshot,
  buildUser: (snap: TelegramUserSnapshot) => BotUser,
): Promise<{
  user: BotUser;
  status: 'new' | 'reactivated' | 'already-active';
}> {
  const existing = await repo.getById(String(snapshot.id));

  if (!existing) {
    const user = buildUser(snapshot);
    await repo.save(user);
    return { user, status: 'new' };
  }

  if (!existing.isActive) {
    await repo.reactivate(existing.id);
    return { user: { ...existing, isActive: true }, status: 'reactivated' };
  }

  return { user: existing, status: 'already-active' };
}
