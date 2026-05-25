import { describe, expect, it } from 'vitest';

import { withTimeout } from '../../../src/core/util/with-timeout';

describe('withTimeout', () => {
  it('resolves with the inner value when the promise settles in time', async () => {
    const result = await withTimeout(Promise.resolve(42), 100, 'fast');
    expect(result).toBe(42);
  });

  it('rejects with a labelled error when the deadline fires first', async () => {
    const pending = new Promise<number>(() => {
      // never resolves
    });
    await expect(withTimeout(pending, 20, 'stuck call')).rejects.toThrow(
      /stuck call timed out after 20ms/,
    );
  });

  it('forwards the inner rejection unchanged when the promise rejects first', async () => {
    const boom = new Error('inner failure');
    await expect(
      withTimeout(Promise.reject(boom), 100, 'should not fire'),
    ).rejects.toBe(boom);
  });
});
