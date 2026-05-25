import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../../src/core/logger/logger';

function makeOutput() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('createLogger', () => {
  it('emits a JSON line containing level, message and timestamp', () => {
    const output = makeOutput();
    const logger = createLogger({ output });

    logger.info('hello');

    expect(output.info).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(output.info.mock.calls[0]![0] as string);
    expect(payload.level).toBe('info');
    expect(payload.message).toBe('hello');
    expect(typeof payload.timestamp).toBe('string');
  });

  it('respects the minimum log level', () => {
    const output = makeOutput();
    const logger = createLogger({ level: 'warn', output });

    logger.info('ignored');
    logger.warn('shown');

    expect(output.info).not.toHaveBeenCalled();
    expect(output.warn).toHaveBeenCalledTimes(1);
  });

  it('includes child context in subsequent records', () => {
    const output = makeOutput();
    const parent = createLogger({ output });
    const child = parent.child({ userId: 42 });

    child.info('msg');

    const payload = JSON.parse(output.info.mock.calls[0]![0] as string);
    expect(payload.userId).toBe(42);
  });

  it('serialises Error objects without losing the stack', () => {
    const output = makeOutput();
    const logger = createLogger({ output });

    logger.error('boom', new Error('kaboom'));

    const payload = JSON.parse(output.error.mock.calls[0]![0] as string);
    expect(payload.meta.message).toBe('kaboom');
    expect(payload.meta.name).toBe('Error');
    expect(typeof payload.meta.stack).toBe('string');
  });
});
