import type { Holiday } from './types';

const BERLIN_COUNTY = 'DE-BE';

/**
 * Keeps the holidays observed in Berlin (Bundesland Berlin):
 *   - everything marked `global: true` (federal holidays)
 *   - plus state-specific holidays whose `counties` includes `DE-BE`
 *
 * Returns a new array sorted ascending by date. `YYYY-MM-DD` strings sort
 * lexicographically the same way as chronologically, so plain
 * `localeCompare` is enough - no Date parsing required.
 */
export function keepBerlin(holidays: Holiday[]): Holiday[] {
  return holidays
    .filter(h => h.global || (h.counties?.includes(BERLIN_COUNTY) ?? false))
    .sort((a, b) => a.date.localeCompare(b.date));
}
