import type {
  BridgeInfo,
  Bucket,
  Holiday,
} from '../core/holidays/types';

const WEEKDAYS_SHORT = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const SHOPS_CLOSED = 'most shops will be closed';

/**
 * Builds the user-facing text for a single threshold reminder. The shape
 * differs per bucket: the 30-day version optionally appends a "long
 * weekend" hint when a second Berlin holiday falls within 7 days.
 */
export function formatHolidayReminder(
  bucket: Bucket,
  holiday: Holiday,
  bridge?: BridgeInfo,
): string {
  const friendly = formatFriendlyDate(holiday.date);

  switch (bucket) {
    case 30: {
      const base = `Heads up: in 30 days it's ${holiday.localName} (${holiday.name}) on ${friendly}.`;
      return bridge ? `${base}\n\n${formatBridge(bridge)}` : base;
    }
    case 7:
      return `${holiday.localName} is one week away (${friendly}).`;
    case 3:
      return `${holiday.localName} is in 3 days (${friendly}). Time to stock the fridge — ${SHOPS_CLOSED}.`;
    case 1:
      return `${holiday.localName} is tomorrow (${friendly}). Last chance to stock up — ${SHOPS_CLOSED}!`;
  }
}

/**
 * Formats a titled bullet list of holidays, used both for the annual
 * Jan 3 broadcast and for the new-user `/start` welcome reply.
 */
export function formatHolidayList(opts: {
  title: string;
  holidays: Holiday[];
}): string {
  const lines = opts.holidays.map(
    h => `• ${formatFriendlyDate(h.date)} — ${h.localName}`,
  );
  return [opts.title, ...lines].join('\n');
}

function formatBridge(bridge: BridgeInfo): string {
  const nextFriendly = formatFriendlyDate(bridge.next.date);
  if (bridge.weekdaysBetween.length === 0) {
    return `And ${bridge.next.localName} follows on ${nextFriendly} — you already have a long weekend!`;
  }
  const n = bridge.weekdaysBetween.length;
  const dayList = bridge.weekdaysBetween.map(formatFriendlyDate).join(', ');
  return `${bridge.next.localName} follows on ${nextFriendly}. Take ${n} day${n === 1 ? '' : 's'} off (${dayList}) and you get an extended break.`;
}

/**
 * Renders `YYYY-MM-DD` as e.g. "Fri 3 Apr 2026". UTC parsing keeps the
 * weekday correct regardless of the runtime's local timezone.
 */
function formatFriendlyDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(n => Number.parseInt(n, 10));
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const weekday = WEEKDAYS_SHORT[date.getUTCDay()];
  const month = MONTHS_SHORT[date.getUTCMonth()];
  return `${weekday} ${d} ${month} ${y}`;
}
