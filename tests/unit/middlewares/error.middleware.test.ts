import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { createErrorMiddleware } from '../../../src/telegram/middlewares/error.middleware';
import {
  createMockAdminNotifier,
  createSilentLogger,
} from '../../helpers/mocks';

const ctx = {
  update: { update_id: 42, message: { text: 'hi' } },
} as unknown as Context;

describe('errorMiddleware', () => {
  it('passes through when next() resolves', async () => {
    const adminNotifier = createMockAdminNotifier();
    const logger = createSilentLogger();
    const middleware = createErrorMiddleware({ adminNotifier, logger });

    const next = vi.fn().mockResolvedValue(undefined);
    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
    expect(adminNotifier.notify).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('notifies on errors thrown downstream and swallows them', async () => {
    const adminNotifier = createMockAdminNotifier();
    const logger = createSilentLogger();
    const middleware = createErrorMiddleware({ adminNotifier, logger });

    const boom = new Error('boom');
    const next = vi.fn().mockRejectedValue(boom);

    await expect(middleware(ctx, next)).resolves.toBeUndefined();

    expect(adminNotifier.notify).toHaveBeenCalledOnce();
    const [message] = adminNotifier.notify.mock.calls[0]!;
    expect(message).toMatch(/^\[ERROR update#42:/);
    expect(message).toContain('Error: boom');
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
