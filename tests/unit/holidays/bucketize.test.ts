import { describe, expect, it } from 'vitest';

import {
  groupByBridges,
  pickAnnualReminder,
  pickThresholdReminder,
  upcomingFrom,
} from '../../../src/core/holidays/bucketize';
import type { Holiday } from '../../../src/core/holidays/types';

function h(date: string, localName = 'Test'): Holiday {
  return { date, localName, name: localName, global: true, counties: null };
}

function utc(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

describe('pickThresholdReminder', () => {
  const holidays = [
    h('2026-04-03', 'Karfreitag'),
    h('2026-04-06', 'Ostermontag'),
    h('2026-05-01', 'Tag der Arbeit'),
  ];

  it.each([
    ['2026-03-04', 30],
    ['2026-03-27', 7],
    ['2026-03-31', 3],
    ['2026-04-02', 1],
  ])('returns bucket %i when today is %s', (today, bucket) => {
    const result = pickThresholdReminder(holidays, utc(today as string));
    expect(result?.bucket).toBe(bucket);
    expect(result?.holiday.date).toBe('2026-04-03');
  });

  it.each(['2026-03-05', '2026-03-26', '2026-04-04', '2026-04-20'])(
    'returns null when today is %s (no holiday is exactly in a bucket)',
    today => {
      expect(pickThresholdReminder(holidays, utc(today))).toBeNull();
    },
  );

  it('skips holidays not in a bucket and matches the next eligible one', () => {
    // today=2026-04-01: Karfreitag is in 2 days (not bucket), Ostermontag
    // in 5 days (not bucket), Tag der Arbeit in 30 days (bucket 30).
    const result = pickThresholdReminder(holidays, utc('2026-04-01'));
    expect(result?.holiday.date).toBe('2026-05-01');
    expect(result?.bucket).toBe(30);
  });

  it('skips past holidays entirely', () => {
    // today=2026-04-30: April holidays already happened, May 1 tomorrow.
    const result = pickThresholdReminder(holidays, utc('2026-04-30'));
    expect(result?.holiday.date).toBe('2026-05-01');
    expect(result?.bucket).toBe(1);
  });

  it('handles year boundary: today 2026-12-02 picks 2027-01-01 at bucket 30', () => {
    const lateYear = [
      h('2026-12-25', 'Erster Weihnachtstag'),
      h('2026-12-26', 'Zweiter Weihnachtstag'),
      h('2027-01-01', 'Neujahr'),
    ];
    const result = pickThresholdReminder(lateYear, utc('2026-12-02'));
    expect(result?.bucket).toBe(30);
    expect(result?.holiday.date).toBe('2027-01-01');
  });

  it('attaches bridge info when the next holiday is within 7 days (Fri+Mon: empty weekdays)', () => {
    const result = pickThresholdReminder(holidays, utc('2026-03-04'));
    expect(result?.bridge).toBeDefined();
    expect(result?.bridge?.next.date).toBe('2026-04-06');
    expect(result?.bridge?.weekdaysBetween).toEqual([]);
  });

  it('omits bridge info when the next holiday is more than 7 days later', () => {
    const sparse = [h('2026-04-03', 'A'), h('2026-04-15', 'B')];
    const result = pickThresholdReminder(sparse, utc('2026-03-04'));
    expect(result?.bridge).toBeUndefined();
  });

  it('computes weekdaysBetween for a Thu->Wed gap (skips Sat/Sun)', () => {
    const pair = [
      h('2026-05-14', 'Christi Himmelfahrt'), // Thursday
      h('2026-05-20', 'Synthetic'), // Wednesday + 6 days
    ];
    const result = pickThresholdReminder(pair, utc('2026-04-14'));
    expect(result?.bridge?.weekdaysBetween).toEqual([
      '2026-05-15', // Fri
      '2026-05-18', // Mon
      '2026-05-19', // Tue
    ]);
  });

  it('returns null on an empty list', () => {
    expect(pickThresholdReminder([], utc('2026-04-03'))).toBeNull();
  });
});

describe('pickAnnualReminder', () => {
  const holidays = [
    h('2026-01-01', 'Neujahr'),
    h('2026-04-03', 'Karfreitag'),
    h('2027-01-01', 'Neujahr'),
  ];

  it('returns this year only when today is January 3rd', () => {
    const result = pickAnnualReminder(holidays, utc('2026-01-03'));
    expect(result?.year).toBe(2026);
    expect(result?.holidays.map(x => x.date)).toEqual([
      '2026-01-01',
      '2026-04-03',
    ]);
  });

  it.each(['2026-01-02', '2026-01-04', '2026-02-03', '2026-12-31'])(
    'returns null on non-Jan-3 dates (%s)',
    today => {
      expect(pickAnnualReminder(holidays, utc(today))).toBeNull();
    },
  );

  it('returns null when no holidays exist for the current year', () => {
    expect(
      pickAnnualReminder([h('2027-01-01', 'Neujahr')], utc('2026-01-03')),
    ).toBeNull();
  });
});

describe('groupByBridges', () => {
  it('returns [] for an empty list', () => {
    expect(groupByBridges([])).toEqual([]);
  });

  it('keeps a single holiday as a one-element singleton group', () => {
    const result = groupByBridges([h('2026-01-01', 'Neujahr')]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
  });

  it('joins consecutive holidays within 7 days into one group', () => {
    const result = groupByBridges([
      h('2026-04-03', 'Karfreitag'),
      h('2026-04-06', 'Ostermontag'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.map(x => x.date)).toEqual(['2026-04-03', '2026-04-06']);
  });

  it('chains 3 holidays as long as each adjacent gap is <= 7 days', () => {
    // 25 -> 26 = 1, 26 -> Jan 1 = 6, both within window
    const result = groupByBridges([
      h('2026-12-25'),
      h('2026-12-26'),
      h('2027-01-01'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3);
  });

  it('starts a new group when the gap exceeds 7 days', () => {
    const result = groupByBridges([
      h('2026-05-01'), // Tag der Arbeit
      h('2026-05-06'), // Christi Himmelfahrt — gap 5
      h('2026-05-17'), // Pfingstmontag — gap 11 (> 7), new group
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]!.map(x => x.date)).toEqual(['2026-05-01', '2026-05-06']);
    expect(result[1]!.map(x => x.date)).toEqual(['2026-05-17']);
  });

  it('models the real user-reported sequence correctly', () => {
    const list = [
      h('2026-05-25', 'Pfingstmontag'),
      h('2026-10-03', 'Tag der Deutschen Einheit'),
      h('2026-12-25', 'Erster Weihnachtstag'),
      h('2026-12-26', 'Zweiter Weihnachtstag'),
      h('2027-01-01', 'Neujahr'),
      h('2027-03-08', 'Frauentag'),
      h('2027-03-26', 'Karfreitag'),
      h('2027-03-29', 'Ostermontag'),
      h('2027-05-01', 'Tag der Arbeit'),
      h('2027-05-06', 'Christi Himmelfahrt'),
      h('2027-05-17', 'Pfingstmontag'),
      h('2027-10-03', 'Tag der Deutschen Einheit'),
      h('2027-12-25', 'Erster Weihnachtstag'),
      h('2027-12-26', 'Zweiter Weihnachtstag'),
    ];
    const lengths = groupByBridges(list).map(g => g.length);
    expect(lengths).toEqual([1, 1, 3, 1, 2, 2, 1, 1, 2]);
  });
});

describe('upcomingFrom', () => {
  const holidays = [
    h('2026-01-01'),
    h('2026-04-03'),
    h('2026-12-25'),
  ];

  it('includes the same-day holiday', () => {
    expect(upcomingFrom(holidays, utc('2026-04-03')).map(x => x.date)).toEqual([
      '2026-04-03',
      '2026-12-25',
    ]);
  });

  it('excludes past holidays', () => {
    expect(upcomingFrom(holidays, utc('2026-04-04')).map(x => x.date)).toEqual([
      '2026-12-25',
    ]);
  });

  it('returns everything when today is before the first holiday', () => {
    expect(upcomingFrom(holidays, utc('2025-12-31'))).toHaveLength(3);
  });

  it('returns [] when today is after the last holiday', () => {
    expect(upcomingFrom(holidays, utc('2027-01-01'))).toEqual([]);
  });
});
