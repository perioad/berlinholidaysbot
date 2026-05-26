import { describe, expect, it } from 'vitest';

import { sleep } from '../../../src/core/util/sleep';

describe('sleep', () => {
  it('resolves to undefined after the requested delay', async () => {
    const start = Date.now();
    await expect(sleep(10)).resolves.toBeUndefined();
    expect(Date.now() - start).toBeGreaterThanOrEqual(8); // some scheduler slack
  });
});
