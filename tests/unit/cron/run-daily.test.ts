import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BotUser } from '../../../src/core/domain/user';
import type { Holiday } from '../../../src/core/holidays/types';
import { runDailyHolidayCheck } from '../../../src/telegram/run-daily';
import type {
  BroadcastResult,
  UserBroadcaster,
} from '../../../src/telegram/user-broadcaster';
import {
  createMockAdminNotifier,
  createMockUsersRepository,
  createSilentLogger,
} from '../../helpers/mocks';

function utc(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function user(id: string): BotUser {
  return {
    id,
    isActive: true,
    isBot: false,
    isPremium: false,
    languageCode: '',
    firstName: '',
    lastName: '',
    username: '',
    startDate: '2025-01-01T00:00:00.000Z',
  };
}

function h(date: string, localName = 'Test'): Holiday {
  return { date, localName, name: localName, global: true, counties: null };
}

function makeDeps(opts: {
  today: Date;
  thisYear?: Holiday[];
  nextYear?: Holiday[];
  activeUsers?: BotUser[];
  broadcastResult?: BroadcastResult;
  fetchHolidaysError?: Error;
}) {
  const broadcast =
    vi.fn<UserBroadcaster['broadcast']>().mockResolvedValue(
      opts.broadcastResult ?? { sent: 0, failed: 0, deactivated: 0 },
    );

  const broadcaster: UserBroadcaster = { broadcast };

  const users = createMockUsersRepository({
    listActive: () => Promise.resolve(opts.activeUsers ?? []),
  });

  const adminNotifier = createMockAdminNotifier();

  const fetchHolidays = vi.fn(async (year: number) => {
    if (opts.fetchHolidaysError) throw opts.fetchHolidaysError;
    if (year === opts.today.getUTCFullYear()) return opts.thisYear ?? [];
    return opts.nextYear ?? [];
  });

  return {
    deps: {
      users,
      adminNotifier,
      broadcaster,
      logger: createSilentLogger(),
      fetchHolidays,
      now: () => opts.today,
    },
    broadcast,
  };
}

describe('runDailyHolidayCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends one "no match" admin ping and no broadcasts when nothing triggers', async () => {
    const { deps, broadcast } = makeDeps({
      today: utc('2026-06-15'),
      thisYear: [h('2026-12-25')],
      nextYear: [],
      activeUsers: [user('1')],
    });

    await runDailyHolidayCheck(deps);

    expect(broadcast).not.toHaveBeenCalled();
    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^Cron: 2026-06-15 no match/,
    );
    expect(deps.users.listActive).not.toHaveBeenCalled();
  });

  it('broadcasts the annual list on January 3rd', async () => {
    const holidays = [h('2026-01-01', 'Neujahr'), h('2026-04-03', 'Karfreitag')];

    const { deps, broadcast } = makeDeps({
      today: utc('2026-01-03'),
      thisYear: holidays,
      activeUsers: [user('1'), user('2')],
      broadcastResult: { sent: 2, failed: 0, deactivated: 0 },
    });

    await runDailyHolidayCheck(deps);

    expect(broadcast).toHaveBeenCalledOnce();
    const [text, recipients] = broadcast.mock.calls[0]!;
    expect(text).toContain('Berlin public holidays in 2026:');
    expect(text).toContain('Neujahr');
    expect(text).toContain('Karfreitag');
    expect(recipients).toHaveLength(2);

    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^Cron: 2026-01-03 annual 2026 sent=2\/2/,
    );
  });

  it('broadcasts a threshold reminder when today is exactly -30 from a holiday', async () => {
    const { deps, broadcast } = makeDeps({
      // 30 days before 2026-04-03 is 2026-03-04
      today: utc('2026-03-04'),
      thisYear: [h('2026-04-03', 'Karfreitag')],
      activeUsers: [user('1')],
      broadcastResult: { sent: 1, failed: 0, deactivated: 0 },
    });

    await runDailyHolidayCheck(deps);

    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast.mock.calls[0]![0]).toContain('Karfreitag');
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /bucket=30 holiday=Karfreitag sent=1\/1/,
    );
  });

  it('broadcasts twice when Jan 3 also lines up with a threshold reminder', async () => {
    // today = 2026-01-03, holiday 2026-02-02 is exactly 30 days away.
    const { deps, broadcast } = makeDeps({
      today: utc('2026-01-03'),
      thisYear: [h('2026-01-01', 'Neujahr'), h('2026-02-02', 'Synthetic')],
      activeUsers: [user('1')],
      broadcastResult: { sent: 1, failed: 0, deactivated: 0 },
    });

    await runDailyHolidayCheck(deps);

    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(deps.adminNotifier.notify).toHaveBeenCalledTimes(2);
    const summaries = deps.adminNotifier.notify.mock.calls.map(c => c[0]);
    expect(summaries.some(s => /annual 2026/.test(s))).toBe(true);
    expect(summaries.some(s => /bucket=30 holiday=Synthetic/.test(s))).toBe(true);
  });

  it('fetches both this year and next year', async () => {
    const { deps } = makeDeps({
      today: utc('2026-06-15'),
      thisYear: [],
      nextYear: [],
    });

    await runDailyHolidayCheck(deps);

    expect(deps.fetchHolidays).toHaveBeenCalledWith(2026);
    expect(deps.fetchHolidays).toHaveBeenCalledWith(2027);
  });

  it('aborts with an admin ping when fetching holidays fails', async () => {
    const { deps, broadcast } = makeDeps({
      today: utc('2026-01-03'),
      fetchHolidaysError: new Error('nager 500'),
    });

    await runDailyHolidayCheck(deps);

    expect(broadcast).not.toHaveBeenCalled();
    expect(deps.users.listActive).not.toHaveBeenCalled();
    expect(deps.adminNotifier.notify).toHaveBeenCalledOnce();
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toMatch(
      /^Cron: 2026-01-03 aborted - holiday fetch failed/,
    );
    expect(deps.adminNotifier.notify.mock.calls[0]![0]).toContain('nager 500');
  });

  it('only lists active users once even when both broadcasts fire', async () => {
    const { deps } = makeDeps({
      today: utc('2026-01-03'),
      thisYear: [h('2026-01-01'), h('2026-02-02')],
      activeUsers: [user('1')],
    });

    await runDailyHolidayCheck(deps);

    expect(deps.users.listActive).toHaveBeenCalledOnce();
  });
});
