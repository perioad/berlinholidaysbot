import { describe, expect, it, vi } from 'vitest';

import { fetchHolidaysFromNager } from '../../../src/core/holidays/nager-client';

const SAMPLE_RESPONSE = [
  {
    date: '2026-01-01',
    localName: 'Neujahr',
    name: "New Year's Day",
    countryCode: 'DE',
    fixed: false,
    global: true,
    counties: null,
    launchYear: null,
    types: ['Public'],
  },
  {
    date: '2026-01-06',
    localName: 'Heilige Drei Könige',
    name: 'Epiphany',
    countryCode: 'DE',
    fixed: false,
    global: false,
    counties: ['DE-BW', 'DE-BY', 'DE-ST'],
    launchYear: null,
    types: ['Public'],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchHolidaysFromNager', () => {
  it('hits the correct Nager URL and parses the response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_RESPONSE));

    const result = await fetchHolidaysFromNager(2026, { fetch: fetchSpy });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      'https://date.nager.at/api/v3/PublicHolidays/2026/DE',
    );
    expect(result).toEqual([
      {
        date: '2026-01-01',
        localName: 'Neujahr',
        name: "New Year's Day",
        global: true,
        counties: null,
      },
      {
        date: '2026-01-06',
        localName: 'Heilige Drei Könige',
        name: 'Epiphany',
        global: false,
        counties: ['DE-BW', 'DE-BY', 'DE-ST'],
      },
    ]);
  });

  it('throws on non-2xx responses', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(
      fetchHolidaysFromNager(2026, { fetch: fetchSpy }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the response shape is malformed', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ date: 'not-a-date' }]));

    await expect(
      fetchHolidaysFromNager(2026, { fetch: fetchSpy }),
    ).rejects.toThrow();
  });

  it('rejects when the request exceeds the timeout', async () => {
    const fetchSpy = vi.fn(
      () => new Promise<Response>(() => {
        // never resolves
      }),
    );

    await expect(
      fetchHolidaysFromNager(2026, { fetch: fetchSpy, timeoutMs: 20 }),
    ).rejects.toThrow(/timed out after 20ms/);
  });
});
