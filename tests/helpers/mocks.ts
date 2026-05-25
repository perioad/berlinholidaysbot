import { type Mock, vi } from 'vitest';

import type { AdminNotifier } from '../../src/core/admin/admin-notifier';
import type { Logger } from '../../src/core/logger/logger';

/**
 * Mock `Logger` where every method is a vitest spy. `child` returns the
 * same instance so chains like `logger.child({...}).info(...)` work
 * without surprises.
 *
 * The `satisfies Logger` clause inside `createSilentLogger` is the
 * compile-time guarantee that this stays structurally compatible with
 * the production `Logger` type.
 */
export type MockLogger = {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
};

export function createSilentLogger(): MockLogger {
  const logger: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  logger satisfies Logger;
  return logger;
}

/**
 * Mock `AdminNotifier` whose `notify` is a vitest spy resolving to
 * undefined. Structurally compatible with `AdminNotifier`, so any code
 * expecting the real type accepts this.
 */
export type MockAdminNotifier = {
  notify: Mock<(message: string) => Promise<void>>;
};

export function createMockAdminNotifier(): MockAdminNotifier {
  const notifier: MockAdminNotifier = {
    notify: vi.fn<(message: string) => Promise<void>>().mockResolvedValue(
      undefined,
    ),
  };
  notifier satisfies AdminNotifier;
  return notifier;
}
