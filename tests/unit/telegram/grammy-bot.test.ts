import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGrammyBot } from '../../../src/telegram/grammy-bot';

/**
 * Regression test for the Lambda hang where grammy's default Node
 * transport (`node-fetch` + `https.Agent`) blocked `bot.init()`
 * indefinitely. `createGrammyBot` must route every API call through the
 * platform `fetch` (undici on Node 20+) so we never go through
 * node-fetch.
 */
describe('createGrammyBot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes Telegram API calls through globalThis.fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: 42,
            is_bot: true,
            first_name: 'Test',
            username: 'testbot',
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const bot = createGrammyBot('123:fake');
    await bot.init();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect(String(requestUrl)).toMatch(/\/getMe$/);
    // grammy must not pass node-fetch-specific options through to the
    // platform fetch - those are the source of the Lambda hang.
    const init = requestInit as (RequestInit & { agent?: unknown; compress?: unknown }) | undefined;
    expect(init?.agent).toBeUndefined();
    expect(init?.compress).toBeUndefined();
  });
});
