import { z } from 'zod';

import { withTimeout } from '../util/with-timeout';
import type { Holiday } from './types';

const NAGER_TIMEOUT_MS = 5000;
const BASE_URL = 'https://date.nager.at/api/v3/PublicHolidays';

/**
 * Nager.Date returns a JSON array of public holidays for a given year and
 * country. We validate only the fields we use; unknown keys (countryCode,
 * fixed, launchYear, types) are silently dropped by zod's default mode.
 */
const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localName: z.string(),
  name: z.string(),
  global: z.boolean(),
  counties: z.array(z.string()).nullable(),
});

const responseSchema = z.array(holidaySchema);

export type FetchHolidaysOptions = {
  /** Override for tests. Defaults to platform `fetch`. */
  fetch?: typeof fetch;
  /** Override the request timeout (ms). */
  timeoutMs?: number;
};

/**
 * Fetches the German public holidays for a given year from Nager.Date and
 * returns them as `Holiday[]`. Throws on non-2xx, timeout, or schema
 * mismatch. The caller is responsible for filtering down to Berlin
 * (see `keepBerlin`).
 */
export async function fetchHolidaysFromNager(
  year: number,
  options: FetchHolidaysOptions = {},
): Promise<Holiday[]> {
  const fetchFn = options.fetch ?? fetch;
  const url = `${BASE_URL}/${year}/DE`;

  const response = await withTimeout(
    fetchFn(url),
    options.timeoutMs ?? NAGER_TIMEOUT_MS,
    `Nager GET ${url}`,
  );

  if (!response.ok) {
    throw new Error(
      `Nager API returned HTTP ${response.status} for year ${year}`,
    );
  }

  const body: unknown = await response.json();
  return responseSchema.parse(body);
}
