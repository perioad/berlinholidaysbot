/**
 * Races a promise against a hard deadline. Rejects with a descriptive
 * Error if the deadline fires first; otherwise resolves with the original
 * value.
 *
 * Used to wrap network calls whose underlying SDKs/libraries have no
 * default request timeout (AWS SDK v3, grammy's Telegram API client),
 * so that misconfigured network or IAM surfaces as a thrown error rather
 * than silently consuming the Lambda invocation budget.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
