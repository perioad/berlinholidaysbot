import { describe, expect, it } from 'vitest';

import { keepBerlin } from '../../../src/core/holidays/berlin-filter';
import type { Holiday } from '../../../src/core/holidays/types';

function h(partial: Partial<Holiday> & { date: string }): Holiday {
  return {
    localName: 'Test',
    name: 'Test',
    global: false,
    counties: null,
    ...partial,
  };
}

describe('keepBerlin', () => {
  it('keeps global holidays', () => {
    const result = keepBerlin([h({ date: '2026-01-01', global: true })]);
    expect(result).toHaveLength(1);
  });

  it('keeps state holidays whose counties include DE-BE', () => {
    const result = keepBerlin([
      h({ date: '2026-03-08', counties: ['DE-BE', 'DE-MV'] }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('drops state holidays not observed in Berlin', () => {
    const result = keepBerlin([
      h({ date: '2026-01-06', counties: ['DE-BW', 'DE-BY', 'DE-ST'] }),
    ]);
    expect(result).toEqual([]);
  });

  it('sorts the result ascending by date', () => {
    const result = keepBerlin([
      h({ date: '2026-05-01', global: true }),
      h({ date: '2026-01-01', global: true }),
      h({ date: '2026-03-08', counties: ['DE-BE'] }),
    ]);
    expect(result.map(x => x.date)).toEqual([
      '2026-01-01',
      '2026-03-08',
      '2026-05-01',
    ]);
  });

  it('handles the real Nager 2026 DE response shape', () => {
    const input: Holiday[] = [
      h({ date: '2026-01-01', global: true }),
      h({ date: '2026-01-06', global: false, counties: ['DE-BW', 'DE-BY', 'DE-ST'] }),
      h({ date: '2026-03-08', global: false, counties: ['DE-BE', 'DE-MV'] }),
      h({ date: '2026-04-03', global: true }),
      h({ date: '2026-06-04', global: false, counties: ['DE-BW', 'DE-BY'] }),
      h({ date: '2026-10-03', global: true }),
    ];
    expect(keepBerlin(input).map(x => x.date)).toEqual([
      '2026-01-01',
      '2026-03-08',
      '2026-04-03',
      '2026-10-03',
    ]);
  });
});
