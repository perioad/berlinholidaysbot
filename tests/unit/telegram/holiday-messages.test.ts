import { describe, expect, it } from 'vitest';

import type {
  BridgeInfo,
  Holiday,
} from '../../../src/core/holidays/types';
import {
  formatHolidayList,
  formatHolidayReminder,
} from '../../../src/telegram/holiday-messages';

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
  it('30 day reminder includes friendly date and English name', () => {
    const out = formatHolidayReminder(30, KARFREITAG);
    expect(out).toBe(
      "Heads up: in 30 days it's Karfreitag (Good Friday) on Fri 3 Apr 2026.",
    );
  });

  it('30 day reminder with empty-weekdays bridge says "long weekend already"', () => {
    const bridge: BridgeInfo = { next: OSTERMONTAG, weekdaysBetween: [] };
    const out = formatHolidayReminder(30, KARFREITAG, bridge);
    expect(out).toContain('Ostermontag');
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
      'Karfreitag is one week away (Fri 3 Apr 2026).',
    );
  });

  it('3 day reminder mentions shops closing', () => {
    const out = formatHolidayReminder(3, KARFREITAG);
    expect(out).toContain('in 3 days');
    expect(out).toContain('shops will be closed');
  });

  it('1 day reminder mentions tomorrow and shops closing', () => {
    const out = formatHolidayReminder(1, KARFREITAG);
    expect(out).toContain('tomorrow');
    expect(out).toContain('shops will be closed');
  });
});

describe('formatHolidayList', () => {
  it('renders the title and a bullet per holiday', () => {
    const out = formatHolidayList({
      title: 'Berlin public holidays in 2026:',
      holidays: [KARFREITAG, OSTERMONTAG],
    });
    expect(out).toBe(
      [
        'Berlin public holidays in 2026:',
        '• Fri 3 Apr 2026 — Karfreitag',
        '• Mon 6 Apr 2026 — Ostermontag',
      ].join('\n'),
    );
  });

  it('returns only the title when the list is empty', () => {
    expect(formatHolidayList({ title: 'Title:', holidays: [] })).toBe('Title:');
  });
});
