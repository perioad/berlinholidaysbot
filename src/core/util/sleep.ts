/**
 * Resolves after `ms` milliseconds. Tiny wrapper around `setTimeout` so
 * callers don't keep redefining the same `new Promise` shape.
 *
 * Mostly used by the broadcaster to space outbound Telegram calls below
 * the API's broadcast rate limit. Tests inject their own fake to avoid
 * actually waiting.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
