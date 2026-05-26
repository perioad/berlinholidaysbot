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
  '<a href="https://en.wikipedia.org/wiki/Long_weekend">Bridge day</a>';

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

describe('formatHolidayReminder', () => {
  it('30 day reminder bolds the names and date', () => {
    const out = formatHolidayReminder(30, KARFREITAG);
    expect(out).toBe(
      "Heads up: in 30 days it's <b>Karfreitag</b> (<i>Good Friday</i>) on <b>Fri 3 Apr 2026</b>.",
    );
  });

  it('30 day reminder with empty-weekdays bridge says "long weekend already"', () => {
    const bridge: BridgeInfo = { next: OSTERMONTAG, weekdaysBetween: [] };
    const out = formatHolidayReminder(30, KARFREITAG, bridge);
    expect(out).toContain('<b>Ostermontag</b>');
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

  it('7 day reminder is a short heads-up', () => {
    expect(formatHolidayReminder(7, KARFREITAG)).toBe(
      '<b>Karfreitag</b> is one week away (<b>Fri 3 Apr 2026</b>).',
    );
  });

  it('3 day reminder mentions shops closing', () => {
    const out = formatHolidayReminder(3, KARFREITAG);
    expect(out).toContain('in 3 days');
    expect(out).toContain('shops will be closed');
    expect(out).toContain('<b>Karfreitag</b>');
  });

  it('1 day reminder mentions tomorrow and shops closing', () => {
    const out = formatHolidayReminder(1, KARFREITAG);
    expect(out).toContain('tomorrow');
    expect(out).toContain('shops will be closed');
    expect(out).toContain('<b>Karfreitag</b>');
  });

  it('escapes HTML special chars in holiday names', () => {
    const evil: Holiday = {
      date: '2026-04-03',
      localName: 'A & B',
      name: '<bad>',
      global: true,
      counties: null,
    };
    const out = formatHolidayReminder(30, evil);
    expect(out).toContain('A &amp; B');
    expect(out).toContain('&lt;bad&gt;');
    expect(out).not.toContain('<bad>');
  });
});

describe('formatHolidayList', () => {
  it('groups close-by holidays under a linked bridge-day label', () => {
    const out = formatHolidayList({
      title: 'Berlin public holidays in 2026:',
      holidays: [KARFREITAG, OSTERMONTAG],
    });
    expect(out).toBe(
      [
        '<b>Berlin public holidays in 2026:</b>',
        `${BRIDGE_LINK} opportunity:`,
        '• Fri 3 Apr 2026 — <b>Karfreitag</b>',
        '• Mon 6 Apr 2026 — <b>Ostermontag</b>',
      ].join('\n'),
    );
  });

  it('renders isolated holidays as a plain bullet block (no label)', () => {
    const isolatedA: Holiday = {
      date: '2026-05-25',
      localName: 'Pfingstmontag',
      name: 'Whit Monday',
      global: true,
      counties: null,
    };
    const isolatedB: Holiday = {
      date: '2026-10-03',
      localName: 'Tag der Deutschen Einheit',
      name: 'German Unity Day',
      global: true,
      counties: null,
    };

    const out = formatHolidayList({
      title: 'Upcoming Berlin public holidays:',
      holidays: [isolatedA, isolatedB],
    });
    expect(out).toBe(
      [
        '<b>Upcoming Berlin public holidays:</b>',
        '• Mon 25 May 2026 — <b>Pfingstmontag</b>',
        '• Sat 3 Oct 2026 — <b>Tag der Deutschen Einheit</b>',
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
      '• <b>Today</b> (Mon 25 May 2026) — <b>Pfingstmontag</b>',
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
        '• Mon 25 May 2026 — <b>Pfingstmontag</b>',
        '',
        `${BRIDGE_LINK} opportunity:`,
        '• Fri 3 Apr 2026 — <b>Karfreitag</b>',
        '• Mon 6 Apr 2026 — <b>Ostermontag</b>',
        '',
        '• Sat 3 Oct 2026 — <b>Tag der Deutschen Einheit</b>',
      ].join('\n'),
    );
  });

  it('returns only the bold title when the list is empty', () => {
    expect(formatHolidayList({ title: 'Title:', holidays: [] })).toBe(
      '<b>Title:</b>',
    );
  });
});
