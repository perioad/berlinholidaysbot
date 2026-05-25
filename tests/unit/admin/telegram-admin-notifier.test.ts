import type { Bot } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { createTelegramAdminNotifier } from '../../../src/core/admin/telegram-admin-notifier';

function makeFakeBot(send: ReturnType<typeof vi.fn>): Bot {
  return {
    api: { sendMessage: send },
  } as unknown as Bot;
}

describe('createTelegramAdminNotifier', () => {
  it('sends the message to the configured chat', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const notifier = createTelegramAdminNotifier({
      token: 'unused',
      chatId: '111',
      bot: makeFakeBot(send),
    });

    await notifier.notify('New user: {"id":42}');

    expect(send).toHaveBeenCalledTimes(1);
    const [chatId, text] = send.mock.calls[0]!;
    expect(chatId).toBe('111');
    expect(text).toBe('New user: {"id":42}');
  });

  it('truncates very long messages to fit Telegram limits', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const notifier = createTelegramAdminNotifier({
      token: 'unused',
      chatId: '111',
      bot: makeFakeBot(send),
    });

    const huge = 'x'.repeat(10_000);
    await notifier.notify(huge);

    const text = send.mock.calls[0]![1] as string;
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text.endsWith('...')).toBe(true);
  });

  it('does not throw when sendMessage fails (uses logger instead)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('429'));
    const logError = vi.fn();
    const notifier = createTelegramAdminNotifier({
      token: 'unused',
      chatId: '111',
      bot: makeFakeBot(send),
      logger: { error: logError },
    });

    await expect(notifier.notify('oops')).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
  });
});
