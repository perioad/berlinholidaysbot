/**
 * Subset of the Nager.Date "PublicHoliday" object we actually use. The
 * external API returns more fields (countryCode, fixed, launchYear, types)
 * but we only keep what drives our message templates and filtering.
 */
export type Holiday = {
  /** Calendar date in `YYYY-MM-DD` format - lexicographically chronological. */
  date: string;
  /** Native-language name, e.g. "Karfreitag". */
  localName: string;
  /** English name, e.g. "Good Friday". */
  name: string;
  /** True when the holiday applies nationwide. */
  global: boolean;
  /**
   * ISO-3166-2 county codes the holiday applies to when not global. `null`
   * for global holidays. Berlin's county code is `DE-BE`.
   */
  counties: string[] | null;
};

/**
 * Days-until-next-holiday buckets that trigger a user reminder. The cron
 * emits a message only when the diff is exactly one of these.
 */
export type Bucket = 30 | 7 | 3 | 1;

/**
 * When a holiday H1 has another Berlin holiday H2 within 7 days after it,
 * the 30-day reminder for H1 also tells the user which weekdays they
 * could take off to extend the break.
 *
 * `weekdaysBetween` is exclusive on both sides and only contains Mon-Fri
 * dates (Sat/Sun are already non-working). It is empty when H1 and H2
 * are adjacent enough that the gap is purely weekend (e.g. Fri + Mon).
 */
export type BridgeInfo = {
  next: Holiday;
  weekdaysBetween: string[];
};
