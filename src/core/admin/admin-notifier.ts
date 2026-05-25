/**
 * One-way channel for sending operational messages to the bot operator:
 * errors caught by middleware, user-joined / user-left notifications, etc.
 *
 * Implementations: Telegram logs bot (default), Slack webhook, Sentry, stdout.
 * Callers depend on this type, never on a specific transport, so the wiring
 * stays swappable.
 */
export type AdminNotifier = {
  notify: (message: string) => Promise<void>;
};

/**
 * Renders an unknown error into a single human-readable string. Safe to call
 * with anything: Error, string, plain object, undefined.
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const codeLine = code !== undefined ? `\nCode: ${String(code)}` : '';
    return `${error.name}: ${error.message}${codeLine}\n${error.stack ?? ''}`.trim();
  }

  if (typeof error === 'string' || typeof error === 'number') {
    return String(error);
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * No-op notifier for tests and local dev where we don't want to hit Telegram.
 */
export const noopAdminNotifier: AdminNotifier = {
  async notify() {
    /* intentionally empty */
  },
};
