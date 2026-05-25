import { Bot } from 'grammy';

/**
 * Constructs a grammy `Bot` configured to use the platform `fetch`
 * (Node 20+ built-in undici) instead of grammy's bundled `node-fetch`.
 *
 * Why: grammy's default Node transport (`platform.node.js`) injects
 * `{ compress: true, agent: new https.Agent({ keepAlive: true }) }`
 * into every API call - both are `node-fetch`-specific options. On AWS
 * Lambda's Node 20 runtime, `node-fetch` v2's underlying `https.request`
 * hangs indefinitely (e.g. `bot.init()` blocks past the function
 * timeout) even though raw `fetch()` to the same URL succeeds in
 * sub-second time.
 *
 * The fix has two parts:
 *   1. `client.fetch: fetch` — route calls through undici, not node-fetch.
 *   2. `baseFetchConfig: { agent: undefined, compress: undefined }` —
 *      grammy spreads its node-fetch defaults BEFORE our overrides
 *      (see grammy `core/client.js`), so passing `{}` is a no-op; we
 *      must explicitly null those keys out or undici receives them.
 *
 * Used by every place that constructs a real Bot. Tests inject their
 * own pre-built Bot via dependency injection and don't go through here.
 */
export function createGrammyBot(token: string): Bot {
  return new Bot(token, {
    client: {
      fetch,
      // The cast is needed because grammy types `baseFetchConfig` as a
      // WHATWG RequestInit, which doesn't have `agent`/`compress` -
      // but those are exactly the keys we need to clear from grammy's
      // node-fetch defaults.
      baseFetchConfig: { agent: undefined, compress: undefined } as Record<
        string,
        unknown
      >,
    },
  });
}
