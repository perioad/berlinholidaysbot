import { groupByBridges } from '../core/holidays/bucketize';
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
 * Wiktionary entry for "Brückentag" — covers the German term directly,
 * with etymology and the cross-language synonyms (puente, faire le pont,
 * Fenstertag). Better fit than the English Wikipedia "Long weekend"
 * article, which is broader and buries the bridge-day concept.
 */
const BRIDGE_WIKIPEDIA_URL = 'https://en.wiktionary.org/wiki/Br%C3%BCckentag';

/**
 * Berlin.de event calendar endpoint. Both `date_start` and `date_stop`
 * use `DD.MM.YYYY` and we pin them to the same day so the result page
 * shows only that day's events.
 */
const BERLIN_EVENTS_BASE_URL =
  'https://www.berlin.de/land/kalender/index.php';

/**
 * All formatters in this file emit Telegram HTML. Callers MUST send
 * with `parse_mode: 'HTML'` (and typically `link_preview_options.is_disabled`
 * to suppress the Wikipedia preview card). Supported tags: `<b>`, `<i>`,
 * `<a href="...">`. Special characters (`<`, `>`, `&`) in dynamic data
 * are escaped via `escapeHtml`.
 */

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
  const title = formatHolidayTitle(holiday);

  switch (bucket) {
    case 30: {
      const base = `Heads up: in 30 days it's ${title} on <b>${friendly}</b>.`;
      return bridge ? `${base}\n\n${formatBridge(bridge)}` : base;
    }
    case 7:
      return `${title} is one week away (<b>${friendly}</b>).`;
    case 3:
      return `${title} is in 3 days (<b>${friendly}</b>). Time to stock the fridge — ${SHOPS_CLOSED}.\n\n\n${formatBerlinEventsLink(holiday.date)}`;
    case 1:
      return `${title} is tomorrow (<b>${friendly}</b>). Last chance to stock up — ${SHOPS_CLOSED}!\n\n\n${formatBerlinEventsLink(holiday.date)}`;
  }
}

/**
 * Renders a one-liner pointing users at the Berlin.de event calendar
 * filtered to a specific day. Appended to the 3-day and 1-day
 * reminders so people have something concrete to do on the holiday.
 */
function formatBerlinEventsLink(yyyyMmDd: string): string {
  return `See what's happening that day: <a href="${berlinEventsUrl(yyyyMmDd)}">browse events on berlin.de</a>.`;
}

/**
 * Builds a Berlin.de calendar URL pinned to a single day. The site
 * expects `DD.MM.YYYY` for both `date_start` and `date_stop`.
 */
function berlinEventsUrl(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-');
  const german = `${d}.${m}.${y}`;
  return `${BERLIN_EVENTS_BASE_URL}?date_start=${german}&date_stop=${german}`;
}

const BRIDGE_LABEL = `<a href="${BRIDGE_WIKIPEDIA_URL}">Bridge day</a> opportunity:`;

/**
 * Formats a titled bullet list of holidays, used both for the annual
 * Jan 3 broadcast and for the `/start` welcome reply.
 *
 * Three niceties on top of a plain bulleted list:
 *
 *   1. If `today` matches a holiday's date (UTC day comparison), that
 *      bullet is prefixed with "<b>Today</b>" so the user sees at a
 *      glance that something is happening right now.
 *
 *   2. Holidays whose adjacent gaps are <= 7 days are grouped under a
 *      "Bridge day opportunity:" section (with "Bridge day" linked to
 *      the Wikipedia article), separated by blank lines from
 *      surrounding singletons.
 *
 *   3. Title is bold, holiday names are bold, date prefixes are plain.
 */
export function formatHolidayList(opts: {
  title: string;
  holidays: Holiday[];
  /** If provided, the matching holiday line is prefixed with "Today". */
  today?: Date;
}): string {
  const title = `<b>${escapeHtml(opts.title)}</b>`;
  const groups = groupByBridges(opts.holidays);

  const sections: string[] = [];
  let pendingSingletons: string[] = [];

  const flushSingletons = (): void => {
    if (pendingSingletons.length > 0) {
      sections.push(pendingSingletons.join('\n'));
      pendingSingletons = [];
    }
  };

  for (const group of groups) {
    if (group.length === 1) {
      pendingSingletons.push(formatHolidayBullet(group[0]!, opts.today));
    } else {
      flushSingletons();
      sections.push(
        [
          BRIDGE_LABEL,
          ...group.map(h => formatHolidayBullet(h, opts.today)),
        ].join('\n'),
      );
    }
  }
  flushSingletons();

  if (sections.length === 0) return title;
  return `${title}\n${sections.join('\n\n')}`;
}

function formatHolidayBullet(h: Holiday, today?: Date): string {
  const friendly = formatFriendlyDate(h.date);
  const title = formatHolidayTitle(h);
  if (today && isSameUtcDay(h.date, today)) {
    return `• <b>Today</b> (${friendly}) — ${title}`;
  }
  return `• ${friendly} — ${title}`;
}

/**
 * Renders a holiday as a bold, Wikipedia-linked title.
 *
 *   <b><a href="...wiki/Good_Friday">Karfreitag / Good Friday</a></b>
 *
 * The link target is the English `name` (which matches the English
 * Wikipedia article title most of the time; Wikipedia redirects handle
 * the rest). The visible text shows both the German `localName` and the
 * English `name` separated by " / " - or just one of them when the API
 * returns the same string for both fields.
 */
function formatHolidayTitle(h: Holiday): string {
  const display =
    h.localName === h.name ? h.localName : `${h.localName} / ${h.name}`;
  return `<b><a href="${wikipediaUrl(h.name)}">${escapeHtml(display)}</a></b>`;
}

/**
 * Builds an English Wikipedia article URL from a plain title:
 *   "Good Friday"   -> https://en.wikipedia.org/wiki/Good_Friday
 *   "New Year's Day" -> https://en.wikipedia.org/wiki/New_Year's_Day
 *
 * Spaces become underscores (Wikipedia's canonical form). Other
 * non-ASCII / reserved chars are percent-encoded via `encodeURIComponent`.
 * For titles that don't match exactly, Wikipedia transparently redirects
 * (e.g. "Ascension Day" -> "Feast of the Ascension"); for unknown titles
 * it shows a "create / search" landing page, which is still useful.
 */
function wikipediaUrl(name: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(name).replace(/%20/g, '_')}`;
}

function isSameUtcDay(yyyyMmDd: string, today: Date): boolean {
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, '0');
  const d = String(today.getUTCDate()).padStart(2, '0');
  return yyyyMmDd === `${y}-${m}-${d}`;
}

function formatBridge(bridge: BridgeInfo): string {
  const nextFriendly = formatFriendlyDate(bridge.next.date);
  const nextTitle = formatHolidayTitle(bridge.next);
  if (bridge.weekdaysBetween.length === 0) {
    return `${nextTitle} follows on <b>${nextFriendly}</b> — you already have a long weekend!`;
  }
  const n = bridge.weekdaysBetween.length;
  const dayList = bridge.weekdaysBetween.map(formatFriendlyDate).join(', ');
  return `${nextTitle} follows on <b>${nextFriendly}</b>. Take ${n} day${n === 1 ? '' : 's'} off (${dayList}) and you get an extended break.`;
}

/**
 * Renders `YYYY-MM-DD` as e.g. "Fri 3 Apr 2026". UTC parsing keeps the
 * weekday correct regardless of the runtime's local timezone. The output
 * is plain text (no HTML); callers wrap it in `<b>` etc. if needed.
 */
function formatFriendlyDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(n => Number.parseInt(n, 10));
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const weekday = WEEKDAYS_SHORT[date.getUTCDay()];
  const month = MONTHS_SHORT[date.getUTCMonth()];
  return `${weekday} ${d} ${month} ${y}`;
}

/**
 * Telegram HTML parse_mode escapes only `<`, `>`, `&`. Anything else
 * (quotes, em dashes, bullets) is safe verbatim. Applied to any dynamic
 * string that originated outside our codebase (holiday names from Nager,
 * user-supplied titles) before splicing into a template.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
