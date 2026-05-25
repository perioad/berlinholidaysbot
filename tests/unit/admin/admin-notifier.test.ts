import { describe, expect, it } from 'vitest';

import {
  formatError,
  noopAdminNotifier,
} from '../../../src/core/admin/admin-notifier';

describe('formatError', () => {
  it('formats Error instances with name and message', () => {
    const text = formatError(new Error('boom'));
    expect(text).toContain('Error: boom');
  });

  it('includes error code when present', () => {
    const err = Object.assign(new Error('boom'), { code: 'EX' });
    expect(formatError(err)).toContain('Code: EX');
  });

  it('returns strings and numbers as-is', () => {
    expect(formatError('plain')).toBe('plain');
    expect(formatError(42)).toBe('42');
  });

  it('JSON-stringifies plain objects', () => {
    expect(formatError({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });

  it('falls back to String() when JSON serialisation throws', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const out = formatError(cyclic);
    expect(typeof out).toBe('string');
  });
});

describe('noopAdminNotifier', () => {
  it('resolves without sending anywhere', async () => {
    await expect(noopAdminNotifier.notify('hello')).resolves.toBeUndefined();
  });
});
