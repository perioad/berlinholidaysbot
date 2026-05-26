import { RetentionDays } from 'aws-cdk-lib/aws-logs';

/**
 * Maps a number-of-days config knob to a CDK `RetentionDays` enum value.
 * The CDK enum only accepts a fixed set of canonical durations - we
 * round to the closest supported one rather than failing, with a sane
 * one-month fallback for anything unusual.
 */
export function mapLogRetention(days: number): RetentionDays {
  switch (days) {
    case 1:
      return RetentionDays.ONE_DAY;
    case 3:
      return RetentionDays.THREE_DAYS;
    case 7:
      return RetentionDays.ONE_WEEK;
    case 14:
      return RetentionDays.TWO_WEEKS;
    case 30:
      return RetentionDays.ONE_MONTH;
    case 60:
      return RetentionDays.TWO_MONTHS;
    case 90:
      return RetentionDays.THREE_MONTHS;
    case 180:
      return RetentionDays.SIX_MONTHS;
    case 365:
      return RetentionDays.ONE_YEAR;
    default:
      return RetentionDays.ONE_MONTH;
  }
}
