import { describe, expect, it } from 'vitest';

import type {
  BridgeInfo,
  Holiday,
} from '../../../src/core/holidays/types';
import {
  formatHolidayList,
  formatHolidayReminder,
} from '../../../src/telegram/holiday-messages';

const BRIDGE_LINK =
  '<a href="https://en.wiktionary.org/wiki/Br%C3%BCckentag">Bridge day</a>';

const KARFREITAG: Holiday = {
  date: '2026-04-03',
  localName: 'Karfreitag',
  name: 'Good Friday',
  global: true,
  counties: null,
};

const OSTERMONTAG: Holiday = {
  date: '2026-04-06',
  localName: 'Ostermontag',
  name: 'Easter Monday',
  global: true,
  counties: null,
};

const KARFREITAG_TITLE =
  '<b><a href="https://en.wikipedia.org/wiki/Good_Friday">Karfreitag / Good Friday</a></b>';
const OSTERMONTAG_TITLE =
  '<b><a href="https://en.wikipedia.org/wiki/Easter_Monday">Ostermontag / Easter Monday</a></b>';

describe('formatHolidayReminder', () => {
  it('30 day reminder wraps the bold title in a Wikipedia link', () => {
    const out = formatHolidayReminder(30, KARFREITAG);
    expect(out).toBe(
      `Heads up: in 30 days it's ${KARFREITAG_TITLE} on <b>Fri 3 Apr 2026</b>.`,
    );
  });

  it('30 day reminder with empty-weekdays bridge says "long weekend already"', () => {
    const bridge: BridgeInfo = { next: OSTERMONTAG, weekdaysBetween: [] };
    const out = formatHolidayReminder(30, KARFREITAG, bridge);
    expect(out).toContain(OSTERMONTAG_TITLE);
    expect(out).toContain('already have a long weekend');
  });

  it('30 day reminder with bridge weekdays lists the dates to take off', () => {
    const bridge: BridgeInfo = {
      next: { ...OSTERMONTAG, date: '2026-04-10', localName: 'Synthetic' },
      weekdaysBetween: ['2026-04-07', '2026-04-08', '2026-04-09'],
    };
    const out = formatHolidayReminder(30, KARFREITAG, bridge);
    expect(out).toContain('Take 3 days off');
    expect(out).toContain('Tue 7 Apr 2026');
    expect(out).toContain('Wed 8 Apr 2026');
    expect(out).toContain('Thu 9 Apr 2026');
  });

  it('7 day reminder is a short heads-up with linked title', () => {
    expect(formatHolidayReminder(7, KARFREITAG)).toBe(
      `${KARFREITAG_TITLE} is one week away (<b>Fri 3 Apr 2026</b>).`,
    );
  });

  it('3 day reminder mentions shops closing and links to Berlin events', () => {
    const out = formatHolidayReminder(3, KARFREITAG);
    expect(out).toContain('in 3 days');
    expect(out).toContain('shops will be closed');
    expect(out).toContain(KARFREITAG_TITLE);
    expect(out).toContain(
      '<a href="https://www.berlin.de/land/kalender/index.php?date_start=03.04.2026&date_stop=03.04.2026">browse events on berlin.de</a>',
    );
  });

  it('1 day reminder mentions tomorrow, shops closing, and links to Berlin events', () => {
    const out = formatHolidayReminder(1, KARFREITAG);
    expect(out).toContain('tomorrow');
    expect(out).toContain('shops will be closed');
    expect(out).toContain(KARFREITAG_TITLE);
    expect(out).toContain(
      '<a href="https://www.berlin.de/land/kalender/index.php?date_start=03.04.2026&date_stop=03.04.2026">browse events on berlin.de</a>',
    );
  });

  it('separates the events link from the main reminder with two blank lines', () => {
    const out = formatHolidayReminder(3, KARFREITAG);
    expect(out).toMatch(
      /shops will be closed\.\n\n\nSee what's happening that day:/,
    );
  });

  it('does not append the events link to 30 or 7 day reminders', () => {
    expect(formatHolidayReminder(30, KARFREITAG)).not.toContain('berlin.de');
    expect(formatHolidayReminder(7, KARFREITAG)).not.toContain('berlin.de');
  });

  it('shows only localName when it equals name (avoids "X / X" duplication)', () => {
    const same: Holiday = {
      date: '2026-04-03',
      localName: 'Tag der Arbeit',
      name: 'Tag der Arbeit',
      global: true,
      counties: null,
    };
    const out = formatHolidayReminder(7, same);
    expect(out).toContain(
      '<b><a href="https://en.wikipedia.org/wiki/Tag_der_Arbeit">Tag der Arbeit</a></b>',
    );
    expect(out).not.toContain('Tag der Arbeit / Tag der Arbeit');
  });

  it('URL-encodes special characters in the link target', () => {
    const ny: Holiday = {
      date: '2026-01-01',
      localName: 'Neujahr',
      name: "New Year's Day",
      global: true,
      counties: null,
    };
    const out = formatHolidayReminder(30, ny);
    expect(out).toContain(
      `href="https://en.wikipedia.org/wiki/New_Year's_Day"`,
    );
  });

  it('escapes HTML special chars in holiday names', () => {
    const evil: Holiday = {
      date: '2026-04-03',
      localName: 'A & B',
      name: 'C',
      global: true,
      counties: null,
    };
    const out = formatHolidayReminder(30, evil);
    expect(out).toContain('A &amp; B / C');
  });
});

describe('formatHolidayList', () => {
  it('groups close-by holidays under a linked bridge-day label, with linked titles', () => {
    const out = formatHolidayList({
      title: 'Berlin public holidays in 2026:',
      holidays: [KARFREITAG, OSTERMONTAG],
    });
    expect(out).toBe(
      [
        '<b>Berlin public holidays in 2026:</b>',
        `${BRIDGE_LINK} opportunity:`,
        `• Fri 3 Apr 2026 — ${KARFREITAG_TITLE}`,
        `• Mon 6 Apr 2026 — ${OSTERMONTAG_TITLE}`,
      ].join('\n'),
    );
  });

  it('renders isolated holidays as a plain bullet block (no bridge label)', () => {
    const pfingstmontag: Holiday = {
      date: '2026-05-25',
      localName: 'Pfingstmontag',
      name: 'Whit Monday',
      global: true,
      counties: null,
    };
    const out = formatHolidayList({
      title: 'Upcoming Berlin public holidays:',
      holidays: [pfingstmontag],
    });
    expect(out).toBe(
      [
        '<b>Upcoming Berlin public holidays:</b>',
        '• Mon 25 May 2026 — <b><a href="https://en.wikipedia.org/wiki/Whit_Monday">Pfingstmontag / Whit Monday</a></b>',
      ].join('\n'),
    );
  });

  it('prefixes the matching holiday with bold "Today" when `today` is provided', () => {
    const pfingstmontag: Holiday = {
      date: '2026-05-25',
      localName: 'Pfingstmontag',
      name: 'Whit Monday',
      global: true,
      counties: null,
    };
    const out = formatHolidayList({
      title: 'Upcoming Berlin public holidays:',
      holidays: [pfingstmontag],
      today: new Date(Date.UTC(2026, 4, 25)),
    });
    expect(out).toContain(
      '• <b>Today</b> (Mon 25 May 2026) — <b><a href="https://en.wikipedia.org/wiki/Whit_Monday">Pfingstmontag / Whit Monday</a></b>',
    );
  });

  it('does not mark anything as "Today" when no holiday matches', () => {
    const out = formatHolidayList({
      title: 'Title:',
      holidays: [KARFREITAG, OSTERMONTAG],
      today: new Date(Date.UTC(2026, 5, 1)),
    });
    expect(out).not.toContain('Today');
  });

  it('separates bridge groups from surrounding singletons with blank lines', () => {
    const list: Holiday[] = [
      {
        date: '2026-05-25',
        localName: 'Pfingstmontag',
        name: 'Whit Monday',
        global: true,
        counties: null,
      },
      KARFREITAG,
      OSTERMONTAG,
      {
        date: '2026-10-03',
        localName: 'Tag der Deutschen Einheit',
        name: 'German Unity Day',
        global: true,
        counties: null,
      },
    ];

    const out = formatHolidayList({
      title: 'Upcoming Berlin public holidays:',
      holidays: list,
    });
    expect(out).toBe(
      [
        '<b>Upcoming Berlin public holidays:</b>',
        '• Mon 25 May 2026 — <b><a href="https://en.wikipedia.org/wiki/Whit_Monday">Pfingstmontag / Whit Monday</a></b>',
        '',
        `${BRIDGE_LINK} opportunity:`,
        `• Fri 3 Apr 2026 — ${KARFREITAG_TITLE}`,
        `• Mon 6 Apr 2026 — ${OSTERMONTAG_TITLE}`,
        '',
        '• Sat 3 Oct 2026 — <b><a href="https://en.wikipedia.org/wiki/German_Unity_Day">Tag der Deutschen Einheit / German Unity Day</a></b>',
      ].join('\n'),
    );
  });

  it('returns only the bold title when the list is empty', () => {
    expect(formatHolidayList({ title: 'Title:', holidays: [] })).toBe(
      '<b>Title:</b>',
    );
  });
});
