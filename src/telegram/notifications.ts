import type { User } from 'grammy/types';

import type { AdminNotifier } from '../core/admin/admin-notifier';

/**
 * Anything that an operator should see in the logs chat. Adding a new
 * event = add a new variant here + a new arm in `formatAdminEvent`. The
 * handlers stay free of message-string concerns.
 */
export type AdminEvent =
  | { kind: 'user-joined'; user: User }
  | { kind: 'user-reactivated'; user: User }
  | { kind: 'user-left'; status: string; user: User | { id: string } }
  | { kind: 'user-message'; user: User | undefined; text: string };

function describeUser(user: User | { id: string } | undefined): string {
  return user ? JSON.stringify(user) : '<unknown>';
}

export function formatAdminEvent(event: AdminEvent): string {
  switch (event.kind) {
    case 'user-joined':
      return `New user: ${describeUser(event.user)}`;
    case 'user-reactivated':
      return `User reactivated: ${describeUser(event.user)}`;
    case 'user-left':
      return `User left (${event.status}): ${describeUser(event.user)}`;
    case 'user-message':
      return `User message: ${describeUser(event.user)}\n${event.text}`;
  }
}

/**
 * Single entrypoint handlers use to push operator notifications - keeps
 * the message format strings in one file and lets us swap delivery (rate
 * limit, batch, etc.) without touching call sites.
 */
export async function notifyAdmin(
  notifier: AdminNotifier,
  event: AdminEvent,
): Promise<void> {
  await notifier.notify(formatAdminEvent(event));
}
